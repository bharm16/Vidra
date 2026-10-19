import { z } from "zod";

const RECOVERY_KEY = "vidraDocsModuleRecovery";
const RecoverySchema = z.object({ route: z.string().max(8192), searchOpen: z.boolean(), scrollTop: z.number().finite().nonnegative(), windowScrollY: z.number().finite().nonnegative() });
export type DocsRecovery = z.infer<typeof RecoverySchema>;
export type DocsRetryView = Omit<DocsRecovery, "route">;

function historyRecord(): Record<string, unknown> {
  const value: unknown = window.history.state;
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : {};
}

export function readDocsRecovery(): DocsRecovery | undefined {
  const result = RecoverySchema.safeParse(historyRecord()[RECOVERY_KEY]);
  return result.success && result.data.route === window.location.pathname + window.location.search ? result.data : undefined;
}

export function clearDocsRecovery(): void {
  const previous = historyRecord();
  if (!Object.hasOwn(previous, RECOVERY_KEY)) return;
  delete previous[RECOVERY_KEY];
  window.history.replaceState(previous, "");
}

/** Browsers retain a failed ES-module fetch in the document's module map. */
export function reloadDocsModules(view: DocsRetryView): void {
  const recovery = RecoverySchema.parse({ ...view, route: window.location.pathname + window.location.search });
  window.history.replaceState({ ...historyRecord(), [RECOVERY_KEY]: recovery }, "");
  window.location.reload();
}
