import type { SingleFlightSource } from "./singleFlight";

export interface ObservedFlight {
  controller: AbortController;
  promise: Promise<unknown>;
  observers: number;
  settled: boolean;
}

/** A caller leaves its observation; provider work ends only after the last observer leaves. */
export function observeFlight<T>(
  flights: Map<string, ObservedFlight>, key: string, signal: AbortSignal,
  compute: (signal: AbortSignal) => Promise<T>,
): Promise<{ value: T; source: SingleFlightSource }> {
  signal.throwIfAborted();
  let flight = flights.get(key);
  const source: SingleFlightSource = flight ? "coalesced" : "computed";
  if (!flight) {
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return compute(controller.signal); });
    flight = { controller, promise, observers: 0, settled: false };
    flights.set(key, flight);
    const current = flight;
    const settle = (): void => { current.settled = true; if (flights.get(key) === current) flights.delete(key); };
    void promise.then(settle, settle);
  }
  const current = flight;
  current.observers += 1;
  return new Promise((resolve, reject) => {
    let finished = false;
    const release = (): boolean => {
      if (finished) return false;
      finished = true;
      signal.removeEventListener("abort", abort);
      current.observers -= 1;
      if (!current.observers && !current.settled) {
        if (flights.get(key) === current) flights.delete(key);
        current.controller.abort();
      }
      return true;
    };
    const abort = (): void => { if (release()) reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void current.promise.then(
      value => { if (release()) resolve({ value: value as T, source }); },
      error => { if (release()) reject(error); },
    );
  });
}
