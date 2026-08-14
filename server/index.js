import { mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { chromium } from "playwright";
import { z } from "zod";
import { prisma } from "./prisma.js";

const app = new Hono();
const uploadDirectory = join(process.cwd(), "storage/uploads");
const tempDirectory = join(process.cwd(), "storage/temp");
await mkdir(uploadDirectory, { recursive: true });
await mkdir(tempDirectory, { recursive: true });

const productSchema = z.object({
  imagePath: z.string().startsWith("/uploads/"),
  wholesalePriceCents: z.number().int().positive(),
  position: z.number().int().nonnegative(),
});

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(120),
  note: z.string().trim().max(140),
  badgeText: z.string().trim().min(1).max(30),
  hashtag: z.string().trim().min(1).max(40),
  products: z.array(productSchema).max(24),
});

async function getPromotion() {
  return prisma.promotion.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
    include: { products: { orderBy: { position: "asc" } } },
  });
}

app.get("/api/promotion", async (context) => context.json(await getPromotion()));

app.put("/api/promotion", async (context) => {
  const parsed = promotionSchema.safeParse(await context.req.json());
  if (!parsed.success)
    return context.json({ error: "Dados inválidos", details: parsed.error.flatten() }, 400);

  const promotion = await prisma.$transaction(async (transaction) => {
    await transaction.product.deleteMany({ where: { promotionId: 1 } });
    return transaction.promotion.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle,
        note: parsed.data.note,
        badgeText: parsed.data.badgeText,
        hashtag: parsed.data.hashtag,
        products: { create: parsed.data.products },
      },
      update: {
        title: parsed.data.title,
        subtitle: parsed.data.subtitle,
        note: parsed.data.note,
        badgeText: parsed.data.badgeText,
        hashtag: parsed.data.hashtag,
        products: { create: parsed.data.products },
      },
      include: { products: { orderBy: { position: "asc" } } },
    });
  });
  return context.json(promotion);
});

app.post("/api/uploads", async (context) => {
  const body = await context.req.parseBody();
  const file = body.image;
  if (!(file instanceof File)) return context.json({ error: "Selecione uma imagem." }, 400);
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  ) {
    return context.json({ error: "Use JPG, PNG ou WebP com até 10 MB." }, 400);
  }
  const extension = extname(file.name).toLowerCase() || ".jpg";
  const filename = `${crypto.randomUUID()}${extension}`;
  await Bun.write(join(uploadDirectory, filename), file);
  return context.json({ path: `/uploads/${filename}` }, 201);
});

app.get("/api/promotion/pdf", async (context) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const appUrl = process.env.APP_URL || "http://localhost:5199";
    await page.goto(`${appUrl}/?print=1`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.printReady === "true");
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="promocao-cronicas.pdf"',
      },
    });
  } catch (error) {
    console.error(error);
    return context.json(
      { error: "Não foi possível gerar o PDF. Verifique a instalação do Chromium." },
      500,
    );
  } finally {
    await browser?.close();
  }
});

app.use("/uploads/*", serveStatic({ root: "./storage" }));
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(process.env.PORT || 3001);
console.log(`API Crônicas disponível em http://localhost:${port}`);

export default { port, fetch: app.fetch };
