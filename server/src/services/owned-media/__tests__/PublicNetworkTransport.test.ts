import { expect, it, vi } from "vitest";
import { requestPublicMedia } from "../PublicNetworkTransport";
import { isPublicNetworkAddress } from "../PublicNetworkAddress";
import { controlledNetwork } from "./controlledNetwork";

it.each([
  "0.0.0.0", "0.1.2.3", "10.1.2.3", "100.64.0.1", "127.1.2.3", "169.254.169.254",
  "172.16.0.1", "172.31.255.254", "192.168.0.1", "192.0.0.8", "192.0.2.1", "192.88.99.1",
  "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255",
  "::", "::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "64:ff9b::7f00:1", "fc01::1",
  "fd12::1", "fe80::1", "febf::1", "ff02::1", "2001::1", "2001:db8::1", "2002:7f00:1::", "3fff::1",
])("refuses nonpublic address %s", address => {
  expect(isPublicNetworkAddress(address)).toBe(false);
});

it.each(["8.8.8.8", "93.184.216.34", "172.32.1.1", "2001:4860:4860::8888", "2606:4700:4700::1111"])("permits global address %s", address => {
  expect(isPublicNetworkAddress(address)).toBe(true);
});

it("pins a checked address without resolving again and retains the URL's TLS/HTTP host", async () => {
  const approved = [{ address: "93.184.216.34", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
  const network = controlledNetwork(() => ({}), approved);
  const response = await requestPublicMedia(new URL("https://cdn.example.test:8443/input?q=signed"), "input", new AbortController().signal, network);
  const [url, options] = network.request.mock.calls[0]!;
  expect(url.href).toBe("https://cdn.example.test:8443/input?q=signed");
  expect(options).toMatchObject({ agent: false, family: 0, autoSelectFamily: true, method: "GET" });
  const callback = vi.fn();
  options.lookup!("cdn.example.test", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  options.lookup!("cdn.example.test", { all: true }, callback);
  expect(callback).toHaveBeenLastCalledWith(null, approved);
  expect(network.resolve).toHaveBeenCalledOnce();
  response.body.destroy();
});

it.each([
  { answers: [{ address: "10.0.0.1", family: 4 }] },
  { answers: [{ address: "93.184.216.34", family: 4 }, { address: "::ffff:127.0.0.1", family: 6 }] },
  { answers: [] },
])("rejects private or mixed DNS answers before opening a socket", async ({ answers }) => {
  const network = controlledNetwork(() => ({}), answers);
  await expect(requestPublicMedia(new URL("http://attacker.example.test/input"), "input", new AbortController().signal, network)).rejects.toThrow("public host");
  expect(network.request).not.toHaveBeenCalled();
});

it.each(["http://2130706433/", "http://0x7f000001/", "http://[::ffff:7f00:1]/", "file:///etc/passwd", "https://user:password@cdn.example.test/input"])("refuses unsafe URL %s before DNS or sockets", async value => {
  const network = controlledNetwork(() => ({}));
  await expect(requestPublicMedia(new URL(value), "input", new AbortController().signal, network)).rejects.toThrow(/Invalid URL/);
  expect(network.request).not.toHaveBeenCalled();
  expect(network.resolve).not.toHaveBeenCalled();
});

it("does not bypass cancellation while awaiting DNS", async () => {
  const network = controlledNetwork(() => ({}));
  let finish!: (answers: [{ address: string; family: number }]) => void;
  network.resolve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const pending = requestPublicMedia(new URL("https://slow.example.test/input"), "input", controller.signal, network);
  controller.abort(new Error("Deadline"));
  await expect(pending).rejects.toThrow("Deadline");
  finish([{ address: "93.184.216.34", family: 4 }]);
  await Promise.resolve();
  expect(network.request).not.toHaveBeenCalled();
});
