#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-require-imports */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEBT_TOLERANCE = 0.01;

function normalizeCurrency(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return "ARS";
  if (["US$", "U$S", "U$D", "DOL"].includes(code)) return "USD";
  if (["$", "AR$"].includes(code)) return "ARS";
  return code;
}

function toNum(v) {
  const n = typeof v === "number" ? v : Number(v ?? NaN);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  const out = new Set();
  for (const item of value) {
    const n = Number(item);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.add(Math.trunc(n));
  }
  return Array.from(out);
}

function normalizeSaleTotals(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [keyRaw, val] of Object.entries(input)) {
    const key = normalizeCurrency(keyRaw);
    const n = typeof val === "number" ? val : Number(String(val).replace(",", "."));
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

function addReceiptToPaidByCurrency(target, receipt) {
  const amountCurrency = normalizeCurrency(receipt.amount_currency || "ARS");
  const amountValue = toNum(receipt.amount);
  const feeValue = toNum(receipt.payment_fee_amount);
  const baseValue = toNum(receipt.base_amount);
  const baseCurrency = receipt.base_currency
    ? normalizeCurrency(receipt.base_currency)
    : null;
  const paymentLines = Array.isArray(receipt.payments) ? receipt.payments : [];

  if (baseCurrency && Math.abs(baseValue) > DEBT_TOLERANCE) {
    const feeInBaseCurrency =
      paymentLines.length > 0
        ? paymentLines.reduce((sum, line) => {
            const lineCurrency = normalizeCurrency(
              line?.payment_currency || amountCurrency,
            );
            if (lineCurrency !== baseCurrency) return sum;
            return sum + toNum(line?.fee_amount);
          }, 0)
        : baseCurrency === amountCurrency
          ? feeValue
          : 0;

    const credited = baseValue + feeInBaseCurrency;
    if (Math.abs(credited) <= DEBT_TOLERANCE) return;
    target[baseCurrency] = round2((target[baseCurrency] || 0) + credited);
    return;
  }

  if (paymentLines.length > 0) {
    for (const line of paymentLines) {
      const lineCurrency = normalizeCurrency(
        line?.payment_currency || amountCurrency,
      );
      const lineAmount = toNum(line?.amount);
      const lineFee = toNum(line?.fee_amount);
      const credited = lineAmount + lineFee;
      if (Math.abs(credited) <= DEBT_TOLERANCE) continue;
      target[lineCurrency] = round2((target[lineCurrency] || 0) + credited);
    }
    return;
  }

  const credited = amountValue + feeValue;
  if (Math.abs(credited) <= DEBT_TOLERANCE) return;
  target[amountCurrency] = round2((target[amountCurrency] || 0) + credited);
}

async function main() {
  const configs = await prisma.serviceCalcConfig.findMany({
    select: {
      id_agency: true,
      use_booking_sale_total: true,
    },
  });
  const inheritedByAgency = new Map(
    configs.map((c) => [c.id_agency, Boolean(c.use_booking_sale_total)]),
  );

  const bookings = await prisma.booking.findMany({
    select: {
      id_booking: true,
      id_agency: true,
      agency_booking_id: true,
      use_booking_sale_total_override: true,
      sale_totals: true,
      services: {
        select: {
          id_service: true,
          currency: true,
          sale_price: true,
        },
      },
      Receipt: {
        select: {
          id_receipt: true,
          agency_receipt_id: true,
          serviceIds: true,
          amount: true,
          amount_currency: true,
          payment_fee_amount: true,
          base_amount: true,
          base_currency: true,
          payments: {
            select: {
              amount: true,
              payment_currency: true,
              fee_amount: true,
            },
          },
        },
      },
    },
  });

  const report = {
    analyzedBookingSaleMode: 0,
    bookingsWithNoServices: [],
    bookingsWithPartialReceiptServiceIds: [],
    bookingsWithReceiptServiceIdsOutsideBooking: [],
    bookingsWithMultiCurrencyReceiptWithoutBase: [],
    bookingsWithPaidCurrencyWithoutSaleCurrency: [],
    bookingsWithOverpaidCurrencies: [],
  };

  for (const booking of bookings) {
    const inherited = inheritedByAgency.get(booking.id_agency) || false;
    const bookingSaleMode =
      typeof booking.use_booking_sale_total_override === "boolean"
        ? booking.use_booking_sale_total_override
        : inherited;

    if (!bookingSaleMode) continue;
    report.analyzedBookingSaleMode += 1;

    const serviceIds = booking.services.map((s) => s.id_service);
    const serviceIdSet = new Set(serviceIds);
    if (serviceIds.length === 0) {
      report.bookingsWithNoServices.push(booking.id_booking);
      continue;
    }

    const fallbackSaleTotals = {};
    for (const svc of booking.services) {
      const cur = normalizeCurrency(svc.currency || "ARS");
      fallbackSaleTotals[cur] = round2(
        (fallbackSaleTotals[cur] || 0) + Math.max(0, toNum(svc.sale_price)),
      );
    }
    const saleTotals =
      Object.keys(normalizeSaleTotals(booking.sale_totals)).length > 0
        ? normalizeSaleTotals(booking.sale_totals)
        : fallbackSaleTotals;

    const paidByCurrency = {};
    const receipts = Array.isArray(booking.Receipt) ? booking.Receipt : [];
    for (const receipt of receipts) {
      const selected = normalizeIdList(receipt.serviceIds);
      if (selected.length > 0 && selected.length < serviceIds.length) {
        report.bookingsWithPartialReceiptServiceIds.push({
          bookingId: booking.id_booking,
          receiptId: receipt.id_receipt,
          selectedCount: selected.length,
          totalServices: serviceIds.length,
        });
      }

      const outside = selected.filter((sid) => !serviceIdSet.has(sid));
      if (outside.length > 0) {
        report.bookingsWithReceiptServiceIdsOutsideBooking.push({
          bookingId: booking.id_booking,
          receiptId: receipt.id_receipt,
          outsideServiceIds: outside,
        });
      }

      const paymentLines = Array.isArray(receipt.payments) ? receipt.payments : [];
      const paymentCurrencies = Array.from(
        new Set(
          paymentLines
            .map((line) => normalizeCurrency(line?.payment_currency || receipt.amount_currency))
            .filter(Boolean),
        ),
      );
      if (
        paymentCurrencies.length > 1 &&
        !(
          receipt.base_currency &&
          Math.abs(toNum(receipt.base_amount)) > DEBT_TOLERANCE
        )
      ) {
        report.bookingsWithMultiCurrencyReceiptWithoutBase.push({
          bookingId: booking.id_booking,
          receiptId: receipt.id_receipt,
          paymentCurrencies,
        });
      }

      addReceiptToPaidByCurrency(paidByCurrency, receipt);
    }

    for (const cur of Object.keys(paidByCurrency)) {
      if (!Object.prototype.hasOwnProperty.call(saleTotals, cur)) {
        report.bookingsWithPaidCurrencyWithoutSaleCurrency.push({
          bookingId: booking.id_booking,
          currency: cur,
          paid: round2(paidByCurrency[cur] || 0),
        });
      }
    }

    const allCurrencies = new Set([
      ...Object.keys(saleTotals),
      ...Object.keys(paidByCurrency),
    ]);
    for (const cur of allCurrencies) {
      const remaining = round2((saleTotals[cur] || 0) - (paidByCurrency[cur] || 0));
      if (remaining < -DEBT_TOLERANCE) {
        report.bookingsWithOverpaidCurrencies.push({
          bookingId: booking.id_booking,
          currency: cur,
          sale: round2(saleTotals[cur] || 0),
          paid: round2(paidByCurrency[cur] || 0),
          overpaid: round2(Math.abs(remaining)),
        });
      }
    }
  }

  const summarize = (arr) => ({
    count: arr.length,
    sample: arr.slice(0, 20),
  });

  console.log(
    JSON.stringify(
      {
        analyzedBookingSaleMode: report.analyzedBookingSaleMode,
        bookingsWithNoServices: summarize(report.bookingsWithNoServices),
        bookingsWithPartialReceiptServiceIds: summarize(
          report.bookingsWithPartialReceiptServiceIds,
        ),
        bookingsWithReceiptServiceIdsOutsideBooking: summarize(
          report.bookingsWithReceiptServiceIdsOutsideBooking,
        ),
        bookingsWithMultiCurrencyReceiptWithoutBase: summarize(
          report.bookingsWithMultiCurrencyReceiptWithoutBase,
        ),
        bookingsWithPaidCurrencyWithoutSaleCurrency: summarize(
          report.bookingsWithPaidCurrencyWithoutSaleCurrency,
        ),
        bookingsWithOverpaidCurrencies: summarize(
          report.bookingsWithOverpaidCurrencies,
        ),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("[audit-booking-sale-mode] Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
