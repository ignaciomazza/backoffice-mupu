import type {
  BuiltPresentment,
  GaliciaPdAdapter,
  ParsedResponseRecord,
  PresentmentInput,
} from "@/services/collections/galicia/direct-debit/adapter";

function pendingLayoutError(): never {
  throw new Error(
    "GaliciaPdV1Adapter pendiente: falta especificación oficial de layout Galicia Pago Directo V1.",
  );
}

export class GaliciaPdV1Adapter implements GaliciaPdAdapter {
  readonly name = "galicia_pd_v1";

  buildPresentment(_input: PresentmentInput): BuiltPresentment {
    void _input;
    // TODO(PR #3): implementar layout TXT/ZIP oficial de Galicia cuando se comparta la especificación.
    return pendingLayoutError();
  }

  parseResponse(_bytes: Buffer): ParsedResponseRecord[] {
    void _bytes;
    // TODO(PR #3): implementar parser de respuesta/rendición oficial Galicia.
    return pendingLayoutError();
  }
}
