/** Stable bytes for review hashes and scope bindings; unsupported data fails. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(",")}}`;
  }
  throw new Error("Workflow identities require finite JSON values");
}
