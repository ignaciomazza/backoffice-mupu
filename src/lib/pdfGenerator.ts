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
  const isVercel = Boolean(process.env.VERCEL); // Vercel setea esta var

  // path real al Chrome en Vercel; si no estás en Vercel, usamos chrome-aws-lambda
  const executablePath = isDev
    ? undefined
    : isVercel
      ? "/usr/bin/chromium-browser"
      : await chromium.executablePath;

  console.error("PDF Generator – exePath:", executablePath);

  const launchArgs = [
    ...(isDev
      ? []
      : isVercel
        ? // flags necesarios en Vercel
          [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--single-process",
          ]
        : chromium.args),
  ];

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: launchArgs,
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const buffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "15mm", right: "15mm" },
  });

  await browser.close();
  return Buffer.from(buffer);
}
