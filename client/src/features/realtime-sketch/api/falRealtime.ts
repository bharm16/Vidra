import { fal } from "@fal-ai/client";

import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { FAL_PROXY_URL, SKETCH_MODEL_ENDPOINT } from "../config/constants";

/**
 * Connection seam for the realtime sketch (transport: ADR-0016).
 * The fal client auto-mints its scoped realtime JWT through our constrained
 * proxy (`proxyUrl`) — FAL_KEY never reaches the browser. The proxy sits
 * behind apiAuthMiddleware, so the mint request carries the same auth
 * headers as every other client call.
 */

export interface RealtimeSketchHandlers {
  onResult(raw: unknown): void;
  onError(error: unknown): void;
}

export interface RealtimeSketchConnection {
  send(payload: Record<string, unknown>): void;
  close(): void;
}

export type ConnectRealtimeSketch = (
  handlers: RealtimeSketchHandlers,
) => RealtimeSketchConnection;

let configured = false;

function ensureFalConfigured(): void {
  if (configured) {
    return;
  }
  fal.config({
    proxyUrl: FAL_PROXY_URL,
    requestMiddleware: async (request) => ({
      ...request,
      headers: {
        ...(request.headers ?? {}),
        ...(await buildFirebaseAuthHeaders()),
      },
    }),
  });
  configured = true;
}

export const connectRealtimeSketch: ConnectRealtimeSketch = (handlers) => {
  ensureFalConfigured();
  const connection = fal.realtime.connect(SKETCH_MODEL_ENDPOINT, {
    connectionKey: "realtime-sketch",
    onResult: (result) => handlers.onResult(result),
    onError: (error) => handlers.onError(error),
  });
  return {
    send: (payload) => connection.send(payload),
    close: () => connection.close(),
  };
};
