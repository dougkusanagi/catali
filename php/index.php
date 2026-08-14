<?php

declare(strict_types=1);

require_once __DIR__ . "/bootstrap.php";

$route = $_GET["route"] ?? ($_SERVER["REQUEST_URI"] ?? "/");
$route = parse_url((string) $route, PHP_URL_PATH) ?: "/";
$method = strtoupper($_SERVER["REQUEST_METHOD"] ?? "GET");

try {
    if ($route === "/api/promotion" && $method === "GET") {
        json_response(promotion_payload(database()));
    }

    if ($route === "/api/promotion/history" && $method === "GET") {
        json_response(["items" => promotion_history_payload(database())]);
    }

    if ($route === "/api/promotion" && $method === "PUT") {
        $input = json_decode(file_get_contents("php://input"), true);
        if (!is_array($input)) json_response(["error" => "JSON inválido."], 400);
        try {
            $promotion = validate_promotion($input);
        } catch (InvalidArgumentException $error) {
            json_response(["error" => $error->getMessage()], 400);
        }
        json_response(save_promotion(database(), $promotion));
    }

    if ($route === "/api/uploads" && $method === "POST") upload_image();
    if ($route === "/api/promotion/pdf" && $method === "GET") generate_pdf();

    json_response(["error" => "Rota não encontrada."], 404);
} catch (PromotionConflict $error) {
    json_response([
        "error" => "Outra pessoa salvou uma versão mais recente. Sua edição continua aberta, mas precisa ser revisada.",
        "code" => "VERSION_CONFLICT",
        "promotion" => $error->promotion,
    ], 409);
} catch (Throwable $error) {
    error_log((string) $error);
    json_response(["error" => "Erro interno do servidor."], 500);
}
