// src/lib/pdfGenerator.ts

import puppeteer from "puppeteer";

interface InvoiceData {
  htmlContent: string;
}

export async function generateInvoicePDF({
  htmlContent,
}: InvoiceData): Promise<Buffer> {
  try {
    console.log(htmlContent);
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        bottom: "10mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error("Error generando el PDF:", error);
    throw new Error("Error generando el PDF");
  }
}
