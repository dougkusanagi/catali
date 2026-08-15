import { chromium } from "playwright";

const [, , url, output, executablePath = "", noSandbox = "0", format = "pdf"] = process.argv;

if (!url || !output) throw new Error("URL e destino do export são obrigatórios.");

const browser = await chromium.launch({
  headless: true,
  executablePath: executablePath || undefined,
  args: noSandbox === "1" ? ["--no-sandbox"] : [],
});

try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.printReady === "true");
  await page.evaluate(() => document.fonts.ready);
  if (format === "jpg" || format === "cover") {
    const target = page.locator(format === "cover" ? ".share-cover" : ".promo-page").first();
    await target.screenshot({ path: output, type: "jpeg", quality: 92 });
  } else {
    await page.pdf({
      path: output,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  }
} finally {
  await browser.close();
}
