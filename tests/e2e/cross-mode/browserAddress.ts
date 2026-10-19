import { createServer } from "node:net";

export interface BrowserAddress {
  origin: string;
  port: number;
}

/** The controlled test server can bind only a local HTTP origin. */
export function parseBrowserAddress(value: string): BrowserAddress {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Browser proof requires an HTTP loopback address");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Browser proof address must be an origin without credentials or a path");
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Browser proof requires an explicit unprivileged port");
  return { origin: url.origin, port };
}

/** Keep the socket until the config is ready; Vite then binds with strictPort. */
export async function reserveBrowserAddress(): Promise<BrowserAddress & { release(): Promise<void> }> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No browser proof port was allocated");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    release: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
