import { chromium } from "playwright";

const [, , appUrl, fixture] = process.argv;

if (!appUrl || !fixture) throw new Error("URL da aplicação e fixture são obrigatórias.");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const fail = (message) => {
  throw new Error(message);
};

await page.addInitScript(() => {
  window.__pdfTest = null;
  window.__pdfDownload = null;
  window.__saveAttempts = 0;

  const originalFetch = window.fetch.bind(window);
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.download === "promocao-cronicas.pdf") {
      window.__pdfDownload = {
        connected: document.body.contains(this),
        download: this.download,
        href: this.href,
      };
    }

    return originalAnchorClick.call(this, ...args);
  };

  window.fetch = async (...args) => {
    if (String(args[0]).includes("/api/promotion") && args[1]?.method === "PUT") {
      window.__saveAttempts += 1;
      if (window.__saveAttempts === 1) {
        throw new TypeError("Falha temporária simulada.");
      }
    }

    const response = await originalFetch(...args);
    if (String(args[0]).includes("/api/promotion/pdf")) {
      const bytes = new Uint8Array(await response.clone().arrayBuffer());
      window.__pdfTest = {
        ok: response.ok,
        contentType: response.headers.get("content-type"),
        size: bytes.length,
        prefix: String.fromCharCode(...bytes.slice(0, 5)),
      };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return response;
  };
});

try {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Gerar PDF", exact: true }).waitFor();
  await page.locator('input[aria-label="file upload"]').setInputFiles(fixture);
  await page.getByText("Ajuste a imagem", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cortar e Salvar", exact: true }).click();
  await page.getByText("Preço de atacado", { exact: true }).first().waitFor();

  const generateButton = page.getByRole("button", { name: "Gerar PDF", exact: true });
  await generateButton.click();
  await page.getByText("Preencha o preço de atacado de todos os produtos.", { exact: true }).first().waitFor();
  await page.locator(".product-row.has-price-error").waitFor();
  await page.locator(".price-input.has-error").waitFor();
  await page.locator('input[aria-invalid="true"]').waitFor();

  const priceInput = page.locator('input[aria-invalid="true"]').first();
  await priceInput.fill("10000");

  await generateButton.click();
  await page.getByText("PDF gerado e baixado.", { exact: true }).waitFor({ timeout: 120000 });

  const result = await page.evaluate(() => ({
    pdfOk: window.__pdfTest?.ok === true,
    contentType: window.__pdfTest?.contentType,
    size: window.__pdfTest?.size || 0,
    prefix: window.__pdfTest?.prefix,
    connected: window.__pdfDownload?.connected,
    download: window.__pdfDownload?.download,
    hrefIsBlob: String(window.__pdfDownload?.href || "").startsWith("blob:"),
    saveAttempts: window.__saveAttempts,
  }));

  if (!result.connected || !result.hrefIsBlob) fail("O download do PDF não passou pelo blob do navegador.");
  if (await page.locator("body").count() === 0) fail("A página do editor foi desmontada.");

  process.stdout.write(JSON.stringify(result));
} finally {
  await browser.close();
}
