This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Billing recurrente (PR #1)

Variables de entorno esperadas:

```bash
BILLING_TIMEZONE=America/Argentina/Buenos_Aires
BILLING_ANCHOR_DAY=8
BILLING_DUNNING_RETRY_DAYS=2,4
BILLING_DIRECT_DEBIT_DISCOUNT_PCT=10
BILLING_DEFAULT_VAT_RATE=0.21
BILLING_REQUIRE_BSP_TODAY=true
BILLING_SECRETS_KEY_B64=<base64-de-32-bytes>
```

## Base de datos y migraciones

Antes de correr migraciones o validar endpoints nuevos:

```bash
npm run db:check-alignment
```

Guía completa:

- `docs/DATABASE_RUNTIME_MIGRATIONS.md`
