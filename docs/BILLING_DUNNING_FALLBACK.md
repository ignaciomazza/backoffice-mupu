# BILLING Dunning + Fallback (PR #6)

## Objetivo
Recuperar cobros rechazados de débito directo (PD Galicia) sin crear un segundo charge:
- un `AgencyBillingCharge` por ciclo sigue siendo la fuente de verdad,
- dunning/fallback corre en pipeline de cobranzas,
- fiscal permanece desacoplado (`BILLING_FISCAL_AUTORUN=false` por defecto).

## Etapas de dunning
- `0`: intento inicial PD.
- `1`: primer reintento PD.
- `2`: segundo/último reintento PD.
- `3`: fallback ofrecido.
- `4`: escalado de cobranza / suspensión.

Transiciones:
- rechazo PD #1 -> stage `1`
- rechazo PD #2 -> stage `2`
- rechazo PD final -> stage `3` + creación de fallback intent
- fallback vencido/fallido -> stage `4`
- pago en cualquier canal -> charge cerrado como `PAID`, se cancelan intents pendientes del otro canal.

## Modelo
### AgencyBillingCharge (extendido)
- `dunning_stage`
- `last_dunning_action_at`
- `fallback_offered_at`
- `fallback_expires_at`
- `collection_channel`
- `paid_via_channel`
- `overdue_since`
- `collections_escalated_at`

### AgencyBillingFallbackIntent (nuevo)
- `provider` (`CIG_QR | MP | OTHER`)
- `status` (`CREATED | PENDING | PRESENTED | PAID | EXPIRED | CANCELED | FAILED`)
- `external_reference` único (idempotencia)
- metadata provider: `provider_payment_id`, `provider_status`, `payment_url`, `qr_payload`, `expires_at`, `paid_at`, `provider_raw_payload`

## Política de pagos tardíos
Se aplica **first win**:
- el primer canal confirmado cierra el charge (`paid_via_channel`),
- si después llega un `PAID` tardío de PD, se registra evento `PD_LATE_SUCCESS_AFTER_FALLBACK_PAID`,
- no se reabre ni se recierra el charge.

## Cierre unificado de charge
Servicio central: `closeChargeAsPaid(...)`.

Acciones:
1. idempotencia (`already_paid`),
2. marca charge `PAID`,
3. setea `paid_via_channel`,
4. cancela intents PD pendientes,
5. cancela fallback intents abiertos,
6. emite `BILLING_CHARGE_PAID`.

## Providers de fallback
- Implementado: `cig_qr_v1_stub` (funcional para end-to-end dev/test).
- Opcional: `mp_stub_v1` (contrato compatible, sin integración productiva).

## Endpoints operativos
- `POST /api/admin/collections/fallback/create`
- `POST /api/admin/collections/fallback/sync`
- `POST /api/admin/collections/fallback/[id]/mark-paid`
- `POST /api/admin/collections/fallback/[id]/cancel`

## Jobs
Se agregan jobs en runner:
- `fallback_create`
- `fallback_status_sync`

Locks:
- `billing:fallback_create:{date_or_charge}`
- `billing:fallback_sync:{provider}:{date}`

## Variables de entorno
- `BILLING_DUNNING_ENABLE_FALLBACK=true`
- `BILLING_FALLBACK_DEFAULT_PROVIDER=cig_qr`
- `BILLING_FALLBACK_EXPIRES_HOURS=72`
- `BILLING_FALLBACK_MP_ENABLED=false`
- `BILLING_FALLBACK_SYNC_BATCH_SIZE=100`
- `BILLING_FALLBACK_AUTO_SYNC=false`
- `BILLING_FISCAL_AUTORUN=false`

## Operación sin Galicia online
El flujo se valida igual con:
- PD por archivos (`debug_csv` / fixtures `galicia_pd_v1`),
- fallback provider stub,
- endpoints/jobs manuales de fallback para simular pago, vencimiento y cancelación.

## Notas de operación
- Este módulo **no depende** de Galicia online para operar.
- El provider fallback actual en este PR es **stub** (`cig_qr_v1_stub`).
- `MP` queda en estado **stub/no productivo**.
- Facturación fiscal sigue desacoplada por default (`BILLING_FISCAL_AUTORUN=false`).

## Known limitations
- No hay webhook real de provider fallback todavía; la sincronización es manual/job.
- No hay notificaciones automáticas multicanal (email/WhatsApp) en este PR.
- MP real/productivo queda para PR futuro.

## Política contable (duplicados tardíos)
Con política **first win**, pagos tardíos del segundo canal se registran para revisión manual/contable y no se compensan automáticamente en este PR.

## Ejemplos de endpoints (manual/dev)
### `POST /api/admin/collections/fallback/create`
Body ejemplo:
```json
{
  "chargeId": 1234,
  "provider": "CIG_QR",
  "dryRun": false
}
```
Respuesta ejemplo:
```json
{
  "created": true,
  "no_op": false,
  "reason": null,
  "charge_id": 1234,
  "provider": "CIG_QR",
  "fallback_intent_id": 88,
  "status": "PENDING",
  "payment_url": "https://stub.cig.local/pay/FBK-1234-CIG_QR-001",
  "qr_payload": "{...}",
  "expires_at": "2026-03-11T18:00:00.000Z"
}
```

### `POST /api/admin/collections/fallback/sync`
Body ejemplo:
```json
{
  "provider": "CIG_QR",
  "fallbackIntentId": 88
}
```
Respuesta ejemplo:
```json
{
  "considered": 1,
  "paid": 0,
  "pending": 1,
  "expired": 0,
  "failed": 0,
  "no_op": false,
  "ids": [88]
}
```

### `POST /api/admin/collections/fallback/[id]/mark-paid`
Respuesta ejemplo:
```json
{
  "fallback_intent_id": 88,
  "charge_id": 1234,
  "already_paid": false,
  "closed_charge": true
}
```
