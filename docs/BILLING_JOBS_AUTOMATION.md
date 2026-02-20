# Billing Jobs Automation (PR #5)

Este documento describe la automatización operativa de cobranzas recurrentes (suscripción mensual), sin acoplar facturación fiscal.

## Alcance

- Pipeline de **cobranza**:
  - `run_anchor_daily`
  - `prepare_pd_batch`
  - `export_pd_batch`
  - `reconcile_pd_batch`
- Persistencia de ejecuciones (`BillingJobRun`)
- Locks de concurrencia (`BillingJobLock`)
- Operación manual y trigger por cron

## Arquitectura

`Cobranzas` y `Facturación` son pipelines separados.

- Cobranzas: suscripciones, ciclos, intents, lotes, conciliación, mora.
- Facturación: AFIP/ARCA por pipeline separado.

Los jobs de este módulo **no dependen** de emisión fiscal para cerrar cobros.
`BILLING_FISCAL_AUTORUN=false` por default.

## Timezone

Las decisiones operativas del scheduler se resuelven en:

- `America/Argentina/Buenos_Aires`

Incluye fecha objetivo de corrida de ancla y ventanas de métricas diarias.

## Jobs

### 1) `run_anchor_daily`

- Ejecuta `runAnchor` para la fecha AR objetivo.
- Reusa idempotencia existente (no duplica cycles/charges/attempts).
- Lock: `billing:run_anchor:{anchor_date_ar}`.

### 2) `prepare_pd_batch`

- Selecciona attempts elegibles (`PENDING`, `scheduled_for <= cutoff`).
- Crea batch outbound en estado `PREPARED`.
- Marca attempts en `PROCESSING`.
- Lock: `billing:prepare_batch:{adapter}:{date_ar}`.

### 3) `export_pd_batch`

- Toma batches `PREPARED/CREATED`.
- Genera archivo outbound por adapter.
- Persiste `file_hash`, `record_count`, `amount_total`, `exported_at`, `storage_key`.
- Marca batch `EXPORTED`.
- Lock:
  - `billing:export_batch:{batch_id}` (si se exporta uno puntual)
  - `billing:export_batch:{adapter}:{date_ar}` (barrido)

### 4) `reconcile_pd_batch`

- Wrapper operativo para import/conciliación de respuesta.
- Soporta modo manual con archivo inbound.
- Mantiene idempotencia por hash + adapter + totals.
- Lock: `billing:reconcile:{batch_id}:{file_hash}`.

## Locks e idempotencia

- Locks con TTL (evitan doble cron / doble click).
- Si lock activo: status `SKIPPED_LOCKED`.
- `run_anchor_daily` es idempotente por claves de ciclo/cobro/intento.
- `prepare_pd_batch` evita duplicación por estado de attempt + lock.
- `export_pd_batch` no regenera si ya fue exportado.
- `reconcile_pd_batch` no reaplica archivo ya importado.

## Variables de entorno

- `BILLING_JOBS_ENABLED` (`false` por default recomendado en local)
- `BILLING_JOBS_TZ` (`America/Argentina/Buenos_Aires`)
- `BILLING_PD_ADAPTER` (`debug_csv` o `galicia_pd_v1`; default `debug_csv`)
- `BILLING_BATCH_AUTO_EXPORT` (`true` default)
- `BILLING_BATCH_AUTO_RECONCILE` (`false` default)
- `BILLING_FISCAL_AUTORUN` (`false` default)
- `BILLING_JOB_RUNNER_SECRET` (opcional para endpoint cron)
- `BILLING_BATCH_CUTOFF_HOUR_AR` (opcional)
- `BILLING_JOB_LOCK_TTL_SECONDS` (opcional, default 900)

## Endpoints operativos

- `POST /api/admin/collections/jobs/run-anchor`
- `POST /api/admin/collections/jobs/prepare-batch`
- `POST /api/admin/collections/jobs/export-batch`
- `POST /api/admin/collections/jobs/reconcile-batch`
- `GET /api/admin/collections/jobs` (métricas + historial)
- `POST /api/admin/collections/jobs/cron` (cron/manual protegido por secret opcional)

## Manual vs automático

- Manual: botones en `/dev/collections/recurring` + endpoints admin.
- Automático: cron externo contra `/api/admin/collections/jobs/cron`.
- Si `BILLING_JOBS_ENABLED=false`, no corre el tick cron automático, pero la operación manual sigue disponible.

## Ejemplos rápidos

```bash
# Trigger manual run-anchor
curl -X POST "http://localhost:3000/api/admin/collections/jobs/run-anchor" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-02-20","overrideFx":false}'

# Trigger manual prepare batch (dry run)
curl -X POST "http://localhost:3000/api/admin/collections/jobs/prepare-batch" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-02-20","dryRun":true}'

# Trigger cron (si hay secret configurado)
curl -X POST "http://localhost:3000/api/admin/collections/jobs/cron" \
  -H "x-billing-job-secret: TU_SECRET"
```

## Operación sin Galicia online

Como no hay acceso operativo al homebanking Galicia en este momento:

- usar `BILLING_PD_ADAPTER=debug_csv` para operación end-to-end local/dev.
- usar fixtures de `galicia_pd_v1` para parseo/conciliación.
- export y reconcile funcionan por archivo, sin conectividad bancaria online.
