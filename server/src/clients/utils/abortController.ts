export interface AbortControllerResult {
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
  cleanup(): void;
  abortedByTimeout: { value: boolean };
}

export const createAbortController = (
  timeout: number,
  externalSignal?: AbortSignal,
): AbortControllerResult => {
  const controller = new AbortController();
  const abortedByTimeout = { value: false };
  const timeoutId = setTimeout(() => {
    abortedByTimeout.value = true;
    controller.abort();
  }, timeout);

  const abort = (): void => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", abort, {
        once: true,
      });
    }
  }

  return { controller, timeoutId, abortedByTimeout, cleanup: () => { clearTimeout(timeoutId); externalSignal?.removeEventListener("abort", abort); } };
};
