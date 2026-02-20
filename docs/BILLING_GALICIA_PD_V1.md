# Cobranzas recurrentes Galicia (PR #4)

## Alcance
Este documento describe el adapter `galicia_pd_v1` para Pago Directo y el flujo de conciliación de cobranzas recurrentes.

## Adapter `galicia_pd_v1`
- Nombre: `galicia_pd_v1`
- Versión: `galicia_pd_v1.0`
- Entrada outbound: intentos normalizados (attempt/charge/agencia + datos mínimos de mandato/cuenta)
- Salida outbound: archivo TXT (`header/detail/trailer`) + metadata + control totals
- Entrada inbound: archivo de respuesta/rendición
- Salida inbound: filas normalizadas + control totals + warnings de parseo

## Formato general
### Outbound
- `H|GALICIA_PD|<layout_version>|<entity>|<service>|<yyyymmdd>|<record_count>|<amount_total>|<checksum>`
- `D|<seq>|<external_attempt_ref>|<amount>|<scheduled_yyyymmdd>|<holder_name>|<holder_tax_id>|<cbu_last4>`
- `T|<record_count>|<amount_total>|<checksum>`

### Inbound
- `H|GALICIA_PD_RESP|<layout_version>|<entity>|<service>|<yyyymmdd>|<record_count>|<amount_total>|<checksum>`
- `D|<seq>|<external_attempt_ref>|<bank_result_code>|<bank_result_message>|<amount>|<settled_yyyymmddhhmmss>|<processor_trace_id>|<operation_id>`
- `T|<record_count>|<amount_total>|<checksum>`

Notas:
- Si faltan definiciones oficiales puntuales, se mantiene layout configurable/versionado por `config` del adapter.
- Los datos crudos (`raw_line`/`raw_payload`) se conservan para trazabilidad.

## Control totals
Se validan:
- `record_count`
- `amount_total`
- `checksum` (cuando el archivo lo informa)

El parser detecta mismatch entre totales declarados y calculados.

## Mapeo de códigos Galicia a estados internos
Estados internos normalizados:
- `PAID`
- `REJECTED`
- `ERROR`
- `UNKNOWN`

Submotivos detallados:
- `REJECTED_INSUFFICIENT_FUNDS`
- `REJECTED_INVALID_ACCOUNT`
- `REJECTED_MANDATE_INVALID`
- `REJECTED_ACCOUNT_CLOSED`
- `ERROR_FORMAT`
- `ERROR_DUPLICATE`

Ejemplos de códigos mapeados:
- `00` -> `PAID`
- `51` -> `REJECTED_INSUFFICIENT_FUNDS`
- `14` -> `REJECTED_INVALID_ACCOUNT`
- `MD01` -> `REJECTED_MANDATE_INVALID`
- `15` -> `REJECTED_ACCOUNT_CLOSED`
- `96` -> `ERROR_FORMAT`
- `94` -> `ERROR_DUPLICATE`
- desconocido -> `UNKNOWN`

## Idempotencia de import
La importación inbound deduplica por:
- `file_hash` (sha256)
- `adapter`
- `record_count`
- `amount_total`

Si se importa el mismo archivo dos veces:
- no se reaplican cambios de conciliación
- se responde con `already_imported=true`
- se registra evento de auditoría (`PD_BATCH_INBOUND_ALREADY_IMPORTED`)

## Desacople cobranza vs facturación
La cobranza recurrente y la facturación fiscal son pipelines separados.
Este módulo cierra cobros y registra eventos; la emisión fiscal corre por proceso independiente.

Implementación actual:
- conciliación emite `BILLING_CHARGE_PAID`
- autorun fiscal queda detrás de feature flag `BILLING_FISCAL_AUTORUN` (default `false`)
