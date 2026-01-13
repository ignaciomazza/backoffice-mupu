# Project Architecture

This document describes the intended structure for the codebase and how new code should be placed.

## Goals
- Keep UI, API, and domain logic clearly separated.
- Avoid circular dependencies and hidden cross-layer imports.
- Make routes and business logic discoverable by convention.

## Directory Layout
- `src/app/` : Next.js App Router pages and layouts. UI composition only.
- `src/pages/api/` : API routes only. No UI.
- `src/components/` : Reusable UI components, grouped by domain (e.g. `bookings`, `receipts`).
- `src/hooks/` : React hooks. UI-facing logic.
- `src/services/` : Domain services and integrations (AFIP, invoices, receipts). Server-side logic.
- `src/lib/` : Low-level helpers and shared libraries (auth, prisma, counters, public ID).
- `src/utils/` : Client utilities (fetch helpers, formatting). Avoid server-only code here.
- `src/types/` : Shared TypeScript types used across UI and API.
- `public/` : Static assets.
- `prisma/` : Prisma schema and migrations.
- `tests/` : Unit/integration tests.
- `docs/` : Product + technical documentation.

## Import Rules
- UI (`src/app`, `src/components`, `src/hooks`) can import from `src/utils`, `src/types`, and UI components.
- API (`src/pages/api`) can import from `src/services`, `src/lib`, `src/types`.
- Services (`src/services`) can import from `src/lib` and `src/types`.
- `src/lib` should not import from UI or `src/app`.

## Public IDs
- Use `public_id` as the URL token for user-facing routes.
- Decode only in API handlers, and validate agency ownership.
- Keep internal DB IDs out of URLs whenever possible.

## Naming Conventions
- Domain folders are lowercase with hyphens: `credit-notes`, `client-payments`.
- File names use PascalCase for components and camelCase for utilities.

