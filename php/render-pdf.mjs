import { chromium } from "playwright";

const [, , url, output, executablePath = "", noSandbox = "0"] = process.argv;

if (!url || !output) throw new Error("URL e destino do PDF são obrigatórios.");

const browser = await chromium.launch({
  headless: true,
  executablePath: executablePath || undefined,
  args: noSandbox === "1" ? ["--no-sandbox"] : [],
});

try {
  const page = await browser.newPage();
  // O Vite mantém o WebSocket de HMR aberto durante o desenvolvimento;
  // a prontidão real da página é sinalizada pelo atributo printReady abaixo.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.printReady === "true");
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
} finally {
  await browser.close();
}
