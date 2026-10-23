import type Replicate from "replicate";
import { setTimeout as sleep } from "node:timers/promises";

type Prediction = Awaited<ReturnType<Replicate["predictions"]["create"]>>;
const terminal = (prediction: Prediction): boolean =>
  ["succeeded", "failed", "canceled", "aborted"].includes(prediction.status);

/** SDK run() drops its signal on create/get; use the cancellable protocol APIs. */
export async function runCancellableVideoPrediction(
  client: Replicate,
  identifier: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
  log: { warn(message: string, meta?: Record<string, unknown>): void },
): Promise<unknown> {
  signal.throwIfAborted();
  let prediction: Prediction | undefined;
  let predictionId: string | undefined;
  let cancellationStarted = false;
  const cancelKnownPrediction = (): void => {
    if (!prediction || !predictionId || terminal(prediction) || cancellationStarted) return;
    cancellationStarted = true;
    // Cancellation is its own bounded request; the execution signal is already
    // aborted. A lost create response leaves an unknown outcome, never a retry.
    void client.predictions.cancel(predictionId, { signal: AbortSignal.timeout(5_000) }).catch(() => {
      log.warn("Replicate cancellation was not confirmed", { predictionId });
    });
  };
  signal.addEventListener("abort", cancelKnownPrediction, { once: true });
  try {
    const separator = identifier.indexOf(":");
    const target = separator >= 0
      ? { version: identifier.slice(separator + 1) }
      : { model: identifier };
    prediction = await client.predictions.create({ ...target, input, wait: true, signal });
    if (typeof prediction.id !== "string" || !prediction.id) throw new Error("Invalid prediction");
    predictionId = prediction.id;
    if (signal.aborted) cancelKnownPrediction();
    signal.throwIfAborted();
    while (!terminal(prediction)) {
      const polled = await client.predictions.get(predictionId, { signal });
      if (polled.id !== predictionId) throw new Error("Replicate prediction identity changed while polling");
      prediction = polled;
      signal.throwIfAborted();
      if (!terminal(prediction)) await sleep(500, undefined, { signal });
    }
    if (prediction.status !== "succeeded") {
      throw new Error(`Prediction ${prediction.status}: ${prediction.error || "No result"}`);
    }
    return prediction.output as unknown;
  } catch (error) {
    if (signal.aborted) cancelKnownPrediction();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelKnownPrediction);
  }
}
