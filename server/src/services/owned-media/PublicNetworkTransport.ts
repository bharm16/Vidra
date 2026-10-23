import { lookup } from "node:dns/promises";
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction, type TcpNetConnectOpts } from "node:net";
import type { Readable } from "node:stream";
import { assertUrlSafe } from "@server/shared/urlValidation";
import { assertNoLegacyApiKeyData } from "@utils/apiKeyUser";
import { isPublicNetworkAddress } from "./PublicNetworkAddress";

export interface ResolvedNetworkAddress {
  address: string;
  family: number;
}

export interface PublicNetworkResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: Readable;
}

type NativeRequest = (
  url: URL,
  options: RequestOptions,
  listener: (response: IncomingMessage) => void,
) => ClientRequest;

/** Inject process-external boundaries in tests, keeping validation in this module. */
export interface PublicNetworkDependencies {
  resolve?: (hostname: string) => Promise<readonly ResolvedNetworkAddress[]>;
  request?: NativeRequest;
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    pending.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", aborted),
    );
  });
}

/**
 * Validate DNS and bind its answer to the connection. Keeping the URL's host
 * preserves HTTP Host and TLS certificate/SNI checks; lookup cannot resolve it
 * again, and a fresh nonpooled socket cannot reuse an unvalidated connection.
 * Native address-family fallback sees only this checked address set.
 */
export async function requestPublicMedia(
  url: URL,
  fieldName: string,
  signal: AbortSignal,
  dependencies: PublicNetworkDependencies = {},
): Promise<PublicNetworkResponse> {
  assertNoLegacyApiKeyData(url.href);
  assertUrlSafe(url.href, fieldName);
  if (url.username || url.password) {
    throw new Error(`Invalid URL for ${fieldName}: credentials are not supported`);
  }
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const resolve = dependencies.resolve ?? (host => lookup(host, { all: true, verbatim: true }));
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await abortable(resolve(hostname), signal);
  if (
    !addresses.length ||
    addresses.some(answer =>
      !isPublicNetworkAddress(answer.address) || isIP(answer.address) !== answer.family,
    )
  ) {
    throw new Error(`Invalid URL for ${fieldName}: URL must target a public host`);
  }
  const address = addresses[0]!;
  const pinnedLookup: LookupFunction = (_hostname, options, callback): void => {
    if (options.all) callback(null, [...addresses]);
    else callback(null, address.address, address.family);
  };
  const send: NativeRequest = dependencies.request ?? ((target, options, listener) => {
    const request = target.protocol === "https:" ? httpsRequest : httpRequest;
    return request(target, options, listener);
  });
  signal.throwIfAborted();
  const requestOptions: RequestOptions & Pick<TcpNetConnectOpts, "autoSelectFamily"> = {
    method: "GET",
    agent: false,
    lookup: pinnedLookup,
    family: 0,
    autoSelectFamily: true,
    signal,
    headers: { "accept-encoding": "identity" },
  };
  return new Promise<PublicNetworkResponse>((resolveResponse, reject) => {
    const request = send(url, requestOptions, response => {
      // Rejections may cancel an unread response. Keep its cancellation error
      // handled even before the consumer starts iterating the body.
      response.on("error", () => undefined);
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach(entry => headers.append(key, entry));
          else if (value !== undefined) headers.set(key, value);
        }
        resolveResponse({
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? "",
          headers,
          body: response,
        });
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    request.once("error", reject);
    request.end();
  });
}
