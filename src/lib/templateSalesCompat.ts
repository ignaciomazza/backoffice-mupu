import type { TemplateConfig } from "@/types/templates";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasStringArrayItems(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function hasSavedCoverItems(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        isRecord(item) &&
        typeof item.url === "string" &&
        item.url.trim().length > 0,
    )
  );
}

export function mergeSalesTemplateConfig(
  primary: TemplateConfig,
  legacy: TemplateConfig | null | undefined,
): TemplateConfig {
  if (!legacy) return primary;

  const next: TemplateConfig = { ...primary };

  const primaryCover = isRecord(primary.coverImage)
    ? { ...(primary.coverImage as Record<string, unknown>) }
    : {};
  const legacyCover = isRecord(legacy.coverImage)
    ? (legacy.coverImage as Record<string, unknown>)
    : null;

  if (legacyCover) {
    const mergedCover: Record<string, unknown> = { ...primaryCover };

    if (
      !hasNonEmptyString(primaryCover.url) &&
      hasNonEmptyString(legacyCover.url)
    ) {
      mergedCover.url = legacyCover.url;
    }

    if (
      !hasStringArrayItems(primaryCover.urls) &&
      hasStringArrayItems(legacyCover.urls)
    ) {
      mergedCover.urls = legacyCover.urls;
    }

    if (
      !hasSavedCoverItems(primaryCover.saved) &&
      hasSavedCoverItems(legacyCover.saved)
    ) {
      mergedCover.saved = legacyCover.saved;
    }

    if (
      !hasNonEmptyString(primaryCover.mode) &&
      hasNonEmptyString(legacyCover.mode)
    ) {
      mergedCover.mode = legacyCover.mode;
    }

    if (Object.keys(mergedCover).length > 0) {
      next.coverImage = mergedCover as TemplateConfig["coverImage"];
    }
  }

  const primaryBlocks = Array.isArray(primary.content?.blocks)
    ? primary.content.blocks
    : [];
  const legacyBlocks = Array.isArray(legacy.content?.blocks)
    ? legacy.content.blocks
    : [];
  if (primaryBlocks.length === 0 && legacyBlocks.length > 0) {
    next.content = {
      ...(primary.content ?? {}),
      blocks: legacyBlocks,
    };
  }

  const primaryPaymentOptions = Array.isArray(primary.paymentOptions)
    ? primary.paymentOptions
    : [];
  const legacyPaymentOptions = Array.isArray(legacy.paymentOptions)
    ? legacy.paymentOptions
    : [];
  if (primaryPaymentOptions.length === 0 && legacyPaymentOptions.length > 0) {
    next.paymentOptions = legacyPaymentOptions;
  }

  return next;
}
