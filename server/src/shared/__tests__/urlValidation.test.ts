import { describe, expect, it } from "vitest";
import { assertUrlSafe, isUrlSafe } from "../urlValidation";

describe("urlValidation", () => {
  describe("public URLs", () => {
    it("allows https to public hostnames", () => {
      expect(isUrlSafe("https://example.com/path")).toBe(true);
      expect(isUrlSafe("https://cdn.example.com/img.png")).toBe(true);
    });

    it("allows http to public hostnames", () => {
      expect(isUrlSafe("http://example.com")).toBe(true);
    });
  });

  describe("scheme restrictions", () => {
    it("rejects file://", () => {
      expect(isUrlSafe("file:///etc/passwd")).toBe(false);
    });

    it("rejects ftp://", () => {
      expect(isUrlSafe("ftp://example.com/file")).toBe(false);
    });

    it("rejects gopher://", () => {
      expect(isUrlSafe("gopher://example.com/")).toBe(false);
    });

    it("rejects malformed URLs", () => {
      expect(isUrlSafe("not a url")).toBe(false);
    });
  });

  describe("blocked hostnames", () => {
    it("rejects localhost", () => {
      expect(isUrlSafe("http://localhost/")).toBe(false);
    });

    it("rejects 127.0.0.1", () => {
      expect(isUrlSafe("http://127.0.0.1/")).toBe(false);
    });

    it("rejects AWS metadata IP", () => {
      expect(isUrlSafe("http://169.254.169.254/latest/meta-data/")).toBe(false);
    });

    it("rejects GCP metadata hostname", () => {
      expect(isUrlSafe("http://metadata.google.internal/")).toBe(false);
    });

    it("rejects [::1] (IPv6 loopback)", () => {
      expect(isUrlSafe("http://[::1]/")).toBe(false);
    });
  });

  describe("private IPv4 ranges", () => {
    it("rejects RFC1918 10.0.0.0/8", () => {
      expect(isUrlSafe("http://10.0.0.1/")).toBe(false);
    });

    it("rejects RFC1918 192.168.0.0/16", () => {
      expect(isUrlSafe("http://192.168.1.1/")).toBe(false);
    });

    it("rejects RFC1918 172.16.0.0/12 range boundaries", () => {
      expect(isUrlSafe("http://172.16.0.1/")).toBe(false);
      expect(isUrlSafe("http://172.31.0.1/")).toBe(false);
    });

    it("allows 172.15.x.x and 172.32.x.x (outside RFC1918 172.16/12)", () => {
      expect(isUrlSafe("http://172.15.0.1/")).toBe(true);
      expect(isUrlSafe("http://172.32.0.1/")).toBe(true);
    });

    it("rejects 127.0.0.0/8 loopback range (not just .0.1)", () => {
      expect(isUrlSafe("http://127.1.2.3/")).toBe(false);
    });

    it("rejects link-local 169.254.0.0/16", () => {
      expect(isUrlSafe("http://169.254.1.1/")).toBe(false);
    });
  });

  describe("IPv4-mapped IPv6 SSRF bypass (regression)", () => {
    // Regression — Node's URL parser normalizes `::ffff:127.0.0.1` to
    // `[::ffff:7f00:1]`, which previously bypassed the IPv4 private-range check
    // because the hostname was bracketed hex, not dotted decimal. An authenticated
    // user could submit `http://[::ffff:169.254.169.254]/` to exfiltrate cloud
    // instance metadata through any fetch routed through urlValidation.

    it("rejects IPv4-mapped IPv6 loopback", () => {
      expect(isUrlSafe("http://[::ffff:127.0.0.1]/")).toBe(false);
    });

    it("rejects IPv4-mapped IPv6 AWS metadata IP", () => {
      expect(
        isUrlSafe("http://[::ffff:169.254.169.254]/latest/meta-data/"),
      ).toBe(false);
    });

    it("rejects IPv4-mapped IPv6 RFC1918 ranges", () => {
      expect(isUrlSafe("http://[::ffff:10.0.0.1]/")).toBe(false);
      expect(isUrlSafe("http://[::ffff:192.168.1.1]/")).toBe(false);
      expect(isUrlSafe("http://[::ffff:172.16.0.1]/")).toBe(false);
    });

    it("rejects the hex-normalized form that Node produces", () => {
      // `::ffff:127.0.0.1` → `[::ffff:7f00:1]` after URL parsing
      expect(isUrlSafe("http://[::ffff:7f00:1]/")).toBe(false);
      // `::ffff:169.254.169.254` → `[::ffff:a9fe:a9fe]`
      expect(isUrlSafe("http://[::ffff:a9fe:a9fe]/")).toBe(false);
    });

    it("rejects IPv4-mapped IPv6 regardless of target address", () => {
      // Invariant: no legitimate URL uses ::ffff: notation, so reject outright.
      expect(isUrlSafe("http://[::ffff:8.8.8.8]/")).toBe(false);
    });
  });

  describe("IPv6 unique-local ranges", () => {
    it("rejects fc00::/7 (ULA)", () => {
      expect(isUrlSafe("http://[fc00::1]/")).toBe(false);
      expect(isUrlSafe("http://[fd12:3456::1]/")).toBe(false);
    });
  });

  describe("IPv6 link-local, unspecified, and NAT64 (regression)", () => {
    // fe80::/10 link-local — previously passed through urlValidation because
    // the fc00:/fd-prefix regex did not cover fe-prefixed addresses. An
    // attacker-submitted http://[fe80::1]/ could reach link-local services.
    it("rejects fe80::/10 link-local (all fe80-febf prefixes)", () => {
      expect(isUrlSafe("http://[fe80::1]/")).toBe(false);
      expect(isUrlSafe("http://[fe80::200:5eff:fe00:5213]/")).toBe(false);
      expect(isUrlSafe("http://[febf::1]/")).toBe(false);
      expect(isUrlSafe("http://[fea0::1]/")).toBe(false);
    });

    it("does not overreach past fe80::/10 (fe00-fe7f, fec0-feff stay permissive)", () => {
      // fe00 is not link-local and is outside ULA; the /10 pattern must not
      // accidentally match fe70:: or similar.
      expect(isUrlSafe("http://[fe00::1]/")).toBe(true);
      expect(isUrlSafe("http://[fe70::1]/")).toBe(true);
    });

    it("rejects [::] (IPv6 unspecified, routes to loopback on Linux)", () => {
      expect(isUrlSafe("http://[::]/")).toBe(false);
    });

    it("rejects 64:ff9b::/96 NAT64 well-known prefix", () => {
      // 64:ff9b::7f00:1 translates to 127.0.0.1 via a NAT64 translator.
      expect(isUrlSafe("http://[64:ff9b::7f00:1]/")).toBe(false);
      expect(isUrlSafe("http://[64:ff9b::a9fe:a9fe]/")).toBe(false);
    });
  });

  describe("assertUrlSafe", () => {
    it("throws when URL is unsafe", () => {
      expect(() => assertUrlSafe("http://127.0.0.1/", "imageUrl")).toThrow(
        /imageUrl/,
      );
    });

    it("does not throw for safe URLs", () => {
      expect(() =>
        assertUrlSafe("https://example.com/a.png", "imageUrl"),
      ).not.toThrow();
    });
  });
});
