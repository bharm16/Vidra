/**
 * Regression: highlight-cache hash parity (migration <-> client).
 *
 * Regression boundary:
 *   1. Failure boundary: pure function (hashString in migrations + client)
 *   2. Mock boundary: none -- pure function on both sides
 *   3. Invariant: For any string s, migration hashString(s) === client hashString(s)
 *      (they share Firestore cache keys; divergence => migrations silently
 *      write to keys the runtime client never matches.)
 *
 * Prior bug (HEAD = b8a1c390 and earlier): migration scripts used
 *   crypto.createHash("sha256").update(str, "utf8").digest("hex").slice(0, 16)
 * while the client used FNV-1a base36. Backfilled cache entries were
 * unreachable on read. This test would have failed against that
 * implementation on every non-empty input.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { hashString as migrationHashString } from "@migrations/hashString";
import { hashString as clientHashString } from "@features/span-highlighting/utils/hashing";

describe("regression: highlight-cache hash parity", () => {
  describe("parity invariant", () => {
    it("migration and client produce identical output for any string", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 1000 }), (input) => {
          expect(migrationHashString(input)).toBe(clientHashString(input));
        }),
        { numRuns: 200 },
      );
    });

    it("matches on tricky edge-case inputs", () => {
      // The NUL fixture is built via String.fromCharCode rather than embedded
      // as a literal so the test source itself stays plain text -- a literal
      // null byte makes git tools (diff, GitHub blob view) treat the file
      // as binary.
      const nullChar = String.fromCharCode(0);
      const inputs = [
        "",
        " ",
        "\n",
        "\t",
        nullChar,
        "rocket-emoji-here",
        "naive-with-diaeresis",
        "a".repeat(10000),
        '{"json":true}',
        "Multi\nline\nprompt",
        "The quick brown fox jumps over the lazy dog",
        "<>&\"'`",
      ];
      for (const input of inputs) {
        expect(migrationHashString(input)).toBe(clientHashString(input));
      }
    });
  });

  describe("output shape", () => {
    it("returns '0' for empty string in both implementations", () => {
      expect(migrationHashString("")).toBe("0");
      expect(clientHashString("")).toBe("0");
    });

    it("returns base36 string for non-empty inputs", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 200 }), (input) => {
          expect(migrationHashString(input)).toMatch(/^[0-9a-z]+$/);
        }),
      );
    });

    it("is deterministic across repeated invocations", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 500 }), (input) => {
          expect(migrationHashString(input)).toBe(migrationHashString(input));
        }),
      );
    });
  });
});
