import { isIP } from "node:net";

/** Only globally routed addresses may receive an ingestion request. */
export function isPublicNetworkAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (isIP(address) !== 6 || address.includes("%")) return false;
  const [first = 0, second = 0] = address.split(":").map(part => Number.parseInt(part || "0", 16));
  // Global unicast is 2000::/3. This also excludes unspecified, loopback,
  // mapped/translated IPv4, ULA, link-local, multicast and NAT64 prefixes.
  if (first < 0x2000 || first > 0x3fff) return false;
  // Special-use, documentation and transition ranges are not public origins.
  if (first === 0x2001 && (second < 0x200 || second === 0xdb8)) return false;
  if (first === 0x2002) return false; // 6to4 embeds an unchecked IPv4 address.
  if (first === 0x3fff && second < 0x1000) return false;
  return true;
}
