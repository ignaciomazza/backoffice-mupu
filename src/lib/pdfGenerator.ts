// src/lib/pdfGenerator.ts
import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer";

interface HtmlContent {
  htmlContent: string;
}

export async function generatePDF({
  htmlContent,
}: HtmlContent): Promise<Buffer> {
  const isDev = process.env.NODE_ENV === "development";

  // en dev uso el Chrome que trae 'puppeteer'
  // en prod uso el binario que trae 'chrome-aws-lambda'
  const browser = isDev
    ? await puppeteer.launch({ headless: true })
    : await chromium.puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const buffer = await page.pdf({
    format: "a4",
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "15mm", right: "15mm" },
  });

  await browser.close();
  return Buffer.from(buffer);
}
