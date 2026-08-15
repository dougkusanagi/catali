<?php

declare(strict_types=1);

define("PROJECT_ROOT", dirname(__DIR__));

function load_dot_env(): void
{
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;

    $path = PROJECT_ROOT . "/.env";
    if (!is_file($path)) return;

    $values = parse_ini_file($path, false, INI_SCANNER_RAW);
    if (!is_array($values)) return;

    foreach ($values as $key => $value) {
        if (!is_string($value) || getenv($key) !== false) continue;
        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
    }
}

function env_value(string $key, ?string $default = null): ?string
{
    load_dot_env();
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function ensure_runtime_directories(): void
{
    foreach ([PROJECT_ROOT . "/storage", PROJECT_ROOT . "/storage/uploads", PROJECT_ROOT . "/storage/temp"] as $directory) {
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException("Não foi possível criar {$directory}.");
        }
    }
}

function database_file(): string
{
    $databaseUrl = env_value("DATABASE_URL", "file:./storage/database.db");
    if (str_starts_with($databaseUrl ?? "", "file:")) {
        $path = substr($databaseUrl, 5);
    } else {
        $path = $databaseUrl;
    }

    if ($path === "" || $path === ":memory:") return $path ?: ":memory:";
    if (!str_starts_with($path, "/")) $path = PROJECT_ROOT . "/" . ltrim($path, "./");
    return $path;
}

function ensure_schema(PDO $database): void
{
    $database->exec("PRAGMA foreign_keys = ON");
    $database->exec(
        <<<'SQL'
        CREATE TABLE IF NOT EXISTS "Promotion" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "title" TEXT NOT NULL DEFAULT 'Ofertas da semana',
            "subtitle" TEXT NOT NULL DEFAULT 'Preço de atacado para você economizar de verdade',
            "note" TEXT NOT NULL DEFAULT 'Ofertas válidas enquanto durarem os estoques',
            "badgeText" TEXT NOT NULL DEFAULT 'ATACADO',
            "hashtag" TEXT NOT NULL DEFAULT '#VEMPROCRÔNICAS',
            "version" INTEGER NOT NULL DEFAULT 1,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        SQL,
    );
    $database->exec(
        <<<'SQL'
        CREATE TABLE IF NOT EXISTS "Product" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "imagePath" TEXT NOT NULL,
            "wholesalePriceCents" INTEGER NOT NULL,
            "position" INTEGER NOT NULL DEFAULT 0,
            "promotionId" INTEGER NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Product_promotionId_fkey"
                FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id")
                ON DELETE CASCADE ON UPDATE CASCADE
        )
        SQL,
    );

    $columns = [];
    foreach ($database->query('PRAGMA table_info("Promotion")')->fetchAll(PDO::FETCH_ASSOC) as $column) {
        $columns[] = $column["name"];
    }
    if (!in_array("badgeText", $columns, true)) {
        $database->exec('ALTER TABLE "Promotion" ADD COLUMN "badgeText" TEXT NOT NULL DEFAULT \'ATACADO\'');
    }
    if (!in_array("hashtag", $columns, true)) {
        $database->exec('ALTER TABLE "Promotion" ADD COLUMN "hashtag" TEXT NOT NULL DEFAULT \'#VEMPROCRÔNICAS\'');
    }
    if (!in_array("version", $columns, true)) {
        $database->exec('ALTER TABLE "Promotion" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1');
    }
    $database->exec(
        <<<'SQL'
        CREATE TABLE IF NOT EXISTS "PromotionHistory" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "promotionVersion" INTEGER NOT NULL,
            "snapshot" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        SQL,
    );
    $database->exec('CREATE INDEX IF NOT EXISTS "PromotionHistory_promotionVersion_idx" ON "PromotionHistory" ("promotionVersion")');
}

function database(): PDO
{
    static $database = null;
    if ($database instanceof PDO) return $database;

    ensure_runtime_directories();
    $database = new PDO("sqlite:" . database_file(), null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    ensure_schema($database);
    return $database;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function promotion_payload(PDO $database): array
{
    $database->exec('INSERT OR IGNORE INTO "Promotion" ("id") VALUES (1)');
    $promotion = $database->query('SELECT * FROM "Promotion" WHERE "id" = 1')->fetch();
    $products = $database
        ->query('SELECT * FROM "Product" WHERE "promotionId" = 1 ORDER BY "position" ASC, "id" ASC')
        ->fetchAll();

    foreach ($products as &$product) {
        $product["id"] = (int) $product["id"];
        $product["wholesalePriceCents"] = (int) $product["wholesalePriceCents"];
        $product["position"] = (int) $product["position"];
        $product["promotionId"] = (int) $product["promotionId"];
    }
    unset($product);

    $promotion["id"] = (int) $promotion["id"];
    $promotion["version"] = (int) ($promotion["version"] ?? 1);
    $promotion["products"] = $products;
    return $promotion;
}

final class PromotionConflict extends RuntimeException
{
    public function __construct(public readonly array $promotion)
    {
        parent::__construct("A promoção foi alterada por outra pessoa.");
    }
}

function validate_text(mixed $value, string $field, int $maxLength, bool $required): string
{
    if (!is_string($value)) throw new InvalidArgumentException("{$field} inválido.");
    $value = trim($value);
    if ($required && $value === "") throw new InvalidArgumentException("{$field} é obrigatório.");
    if (mb_strlen($value) > $maxLength) throw new InvalidArgumentException("{$field} excede o limite.");
    return $value;
}

function validate_promotion(array $input): array
{
    $version = $input["version"] ?? null;
    if (!is_int($version) || $version < 1) {
        throw new InvalidArgumentException("Versão da promoção inválida. Recarregue a página.");
    }

    if (!array_key_exists("products", $input) || !is_array($input["products"])) {
        throw new InvalidArgumentException("Produtos inválidos.");
    }
    if (count($input["products"]) > 24) throw new InvalidArgumentException("O limite é de 24 produtos.");

    $products = [];
    foreach ($input["products"] as $product) {
        if (!is_array($product)) throw new InvalidArgumentException("Produto inválido.");
        $imagePath = $product["imagePath"] ?? null;
        $price = $product["wholesalePriceCents"] ?? null;
        $position = $product["position"] ?? null;
        if (!is_string($imagePath) || !str_starts_with($imagePath, "/uploads/")) {
            throw new InvalidArgumentException("Caminho da imagem inválido.");
        }
        if (!is_int($price) || $price <= 0) {
            throw new InvalidArgumentException("Preço de atacado inválido.");
        }
        if (!is_int($position) || $position < 0) {
            throw new InvalidArgumentException("Posição do produto inválida.");
        }
        $products[] = [
            "imagePath" => $imagePath,
            "wholesalePriceCents" => $price,
            "position" => $position,
        ];
    }

    return [
        "title" => validate_text($input["title"] ?? null, "Título", 60, true),
        "subtitle" => validate_text($input["subtitle"] ?? null, "Chamada", 120, false),
        "note" => validate_text($input["note"] ?? null, "Rodapé", 140, false),
        "badgeText" => validate_text($input["badgeText"] ?? null, "Selo vermelho", 30, true),
        "hashtag" => validate_text($input["hashtag"] ?? null, "Hashtag", 40, true),
        "version" => $version,
        "products" => $products,
    ];
}

function record_promotion_snapshot(PDO $database, array $promotion): void
{
    $insert = $database->prepare(
        'INSERT INTO "PromotionHistory" ("promotionVersion", "snapshot") VALUES (:version, :snapshot)',
    );
    $insert->execute([
        "version" => $promotion["version"],
        "snapshot" => json_encode($promotion, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $database->exec(
        'DELETE FROM "PromotionHistory" WHERE "id" NOT IN (
            SELECT "id" FROM "PromotionHistory" ORDER BY "id" DESC LIMIT 10
        )',
    );
}

function promotion_history_payload(PDO $database): array
{
    return $database
        ->query('SELECT "promotionVersion", "snapshot", "createdAt" FROM "PromotionHistory" ORDER BY "id" DESC LIMIT 10')
        ->fetchAll();
}

function save_promotion(PDO $database, array $promotion): array
{
    $database->beginTransaction();
    try {
        $database->exec('INSERT OR IGNORE INTO "Promotion" ("id") VALUES (1)');
        $update = $database->prepare(
            'UPDATE "Promotion" SET "title" = :title, "subtitle" = :subtitle, "note" = :note,
             "badgeText" = :badgeText, "hashtag" = :hashtag,
             "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
             WHERE "id" = 1 AND "version" = :version',
        );
        $update->execute([
            "title" => $promotion["title"],
            "subtitle" => $promotion["subtitle"],
            "note" => $promotion["note"],
            "badgeText" => $promotion["badgeText"],
            "hashtag" => $promotion["hashtag"],
            "version" => $promotion["version"],
        ]);
        if ($update->rowCount() !== 1) {
            $database->rollBack();
            throw new PromotionConflict(promotion_payload($database));
        }

        $database->exec('DELETE FROM "Product" WHERE "promotionId" = 1');
        $insert = $database->prepare(
            'INSERT INTO "Product" ("imagePath", "wholesalePriceCents", "position", "promotionId")
             VALUES (:imagePath, :wholesalePriceCents, :position, 1)',
        );
        foreach ($promotion["products"] as $product) $insert->execute($product);
        $savedPromotion = promotion_payload($database);
        record_promotion_snapshot($database, $savedPromotion);
        $database->commit();
    } catch (Throwable $error) {
        if ($database->inTransaction()) $database->rollBack();
        throw $error;
    }

    return $savedPromotion;
}

function upload_image(): never
{
    $file = $_FILES["image"] ?? null;
    if (!is_array($file) || ($file["error"] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        json_response(["error" => "Selecione uma imagem."], 400);
    }
    if (($file["size"] ?? 0) > 10 * 1024 * 1024) {
        json_response(["error" => "Use JPG, PNG ou WebP com até 10 MB."], 400);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file["tmp_name"]);
    $extensions = ["image/jpeg" => ".jpg", "image/png" => ".png", "image/webp" => ".webp"];
    if (!isset($extensions[$mime])) {
        json_response(["error" => "Use JPG, PNG ou WebP com até 10 MB."], 400);
    }

    $filename = bin2hex(random_bytes(16)) . $extensions[$mime];
    $destination = PROJECT_ROOT . "/storage/uploads/" . $filename;
    if (!move_uploaded_file($file["tmp_name"], $destination)) {
        json_response(["error" => "Não foi possível salvar a imagem."], 500);
    }
    json_response(["path" => "/uploads/{$filename}"], 201);
}

function chromium_binary(): ?string
{
    $candidates = [];
    $configured = env_value("CHROMIUM_BIN");
    if ($configured) $candidates[] = $configured;
    $candidates = array_merge($candidates, [
        // O headless shell não inicializa o Crashpad e é mais confiável em PHP-FPM.
        // Mantenha-o antes do Chrome completo quando ambos vierem do Playwright.
        ...glob("/var/www/.cache/ms-playwright/*/chrome-headless-shell-linux64/chrome-headless-shell") ?: [],
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        ...glob("/var/www/.cache/ms-playwright/*/chrome-linux/chrome") ?: [],
        ...glob("/var/www/.cache/ms-playwright/*/chrome-linux64/chrome") ?: [],
    ]);
    foreach ($candidates as $candidate) if (is_file($candidate) && is_executable($candidate)) return $candidate;
    return null;
}

function pdf_runtime_binary(): ?string
{
    $candidates = [];
    $configured = env_value("PDF_RUNTIME_BIN");
    if ($configured) $candidates[] = $configured;
    $candidates = array_merge($candidates, [
        "/usr/local/bin/node",
        "/usr/bin/node",
        "/usr/local/bin/bun",
        "/usr/bin/bun",
        "/root/.bun/bin/bun",
    ]);
    foreach ($candidates as $candidate) if (is_file($candidate) && is_executable($candidate)) return $candidate;
    return null;
}

function print_url(): string
{
    $configured = env_value("PDF_APP_URL");
    if ($configured) return rtrim($configured, "/") . "/?print=1";
    $https = !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off";
    $scheme = $https ? "https" : "http";
    $host = $_SERVER["HTTP_HOST"] ?? "127.0.0.1:8080";
    return "{$scheme}://{$host}/?print=1";
}

function remove_directory(string $directory): void
{
    if (!is_dir($directory)) return;
    foreach (scandir($directory) ?: [] as $entry) {
        if ($entry === "." || $entry === "..") continue;
        $path = $directory . "/" . $entry;
        is_dir($path) ? remove_directory($path) : @unlink($path);
    }
    @rmdir($directory);
}

function generate_pdf(): never
{
    $binary = chromium_binary();
    $runtime = pdf_runtime_binary();
    $playwrightScript = PROJECT_ROOT . "/php/render-pdf.mjs";

    $profile = sys_get_temp_dir() . "/promo-chromium-" . bin2hex(random_bytes(8));
    if (!mkdir($profile, 0700, true) && !is_dir($profile)) {
        json_response(["error" => "Não foi possível preparar o PDF."], 500);
    }
    $output = $profile . "/promocao-cronicas.pdf";
    if ($runtime && is_file($playwrightScript)) {
        $arguments = [
            $runtime,
            $playwrightScript,
            print_url(),
            $output,
            $binary ?? "",
            env_value("CHROMIUM_NO_SANDBOX", "0") === "1" ? "1" : "0",
        ];
    } elseif ($binary) {
        $arguments = [
            $binary,
            "--headless=new",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=12000",
            "--user-data-dir={$profile}",
            "--print-to-pdf={$output}",
            print_url(),
        ];
        if (env_value("CHROMIUM_NO_SANDBOX", "0") === "1") $arguments[] = "--no-sandbox";
    } else {
        remove_directory($profile);
        json_response(["error" => "Playwright/Chromium não encontrado para gerar o PDF."], 500);
    }
    $command = implode(" ", array_map("escapeshellarg", $arguments));
    $descriptors = [1 => ["pipe", "w"], 2 => ["pipe", "w"]];
    $process = proc_open($command, $descriptors, $pipes);
    if (!is_resource($process)) {
        remove_directory($profile);
        json_response(["error" => "Não foi possível iniciar o Chromium."], 500);
    }
    $errorOutput = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    if ($exitCode !== 0 || !is_file($output) || filesize($output) === 0) {
        error_log("Falha no Chromium ({$exitCode}): {$errorOutput}");
        remove_directory($profile);
        json_response(["error" => "Não foi possível gerar o PDF com o Chromium."], 500);
    }

    header("Content-Type: application/pdf");
    header('Content-Disposition: attachment; filename="promocao-cronicas.pdf"');
    header("Content-Length: " . filesize($output));
    readfile($output);
    remove_directory($profile);
    exit;
}
