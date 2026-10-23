import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { vi } from "vitest";
import type { PublicNetworkDependencies, ResolvedNetworkAddress } from "../PublicNetworkTransport";

export interface NetworkReply {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: Readable;
}

/** No DNS or socket is used; the native request options remain observable. */
export function controlledNetwork(
  reply: (url: URL, options: RequestOptions) => NetworkReply | Promise<NetworkReply>,
  answers: readonly ResolvedNetworkAddress[] = [{ address: "93.184.216.34", family: 4 }],
): Required<PublicNetworkDependencies> & {
  resolve: ReturnType<typeof vi.fn<(hostname: string) => Promise<readonly ResolvedNetworkAddress[]>>>;
  request: ReturnType<typeof vi.fn<NonNullable<PublicNetworkDependencies["request"]>>>;
} {
  const resolve = vi.fn(async (_hostname: string) => answers);
  const request = vi.fn((url: URL, options: RequestOptions, listener: (response: IncomingMessage) => void): ClientRequest => {
    const connection = new EventEmitter();
    let response: Readable | undefined;
    const aborted = (): void => {
      response?.destroy();
      connection.emit("error", options.signal?.reason ?? new Error("Aborted"));
    };
    const end = (): ClientRequest => {
      options.signal?.addEventListener("abort", aborted, { once: true });
      void Promise.resolve().then(() => reply(url, options)).then(result => {
        response = result.body ?? Readable.from([]);
        if (options.signal?.aborted) { response.destroy(); return; }
        response.once("close", () => options.signal?.removeEventListener("abort", aborted));
        listener(Object.assign(response, {
          statusCode: result.status ?? 200,
          statusMessage: result.statusText ?? "OK",
          headers: result.headers ?? { "content-type": "image/png" },
        }) as IncomingMessage);
      }, error => connection.emit("error", error));
      return connection as ClientRequest;
    };
    return Object.assign(connection, { end }) as ClientRequest;
  });
  return { resolve, request };
}
