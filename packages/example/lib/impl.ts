export function normalizeLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ") || "Untitled";
}
