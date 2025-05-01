// src/lib/pdfGenerator.ts
import chromium from "chrome-aws-lambda";
// puppeteer "completo" lo usaremos sólo en dev
import puppeteer from "puppeteer";

interface HtmlContent {
  htmlContent: string;
}

export async function generatePDF({
  htmlContent,
}: HtmlContent): Promise<Buffer> {
  const isDev = process.env.NODE_ENV === "development";

  const browser = isDev
    ? // en dev tiramos de puppeteer normal (trae su propio Chromium)
      await puppeteer.launch({ headless: true })
    : // en prod usamos chrome-aws-lambda
      await chromium.puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "a4",
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "15mm", right: "15mm" },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}
