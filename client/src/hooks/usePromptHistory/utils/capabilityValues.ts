import type { CapabilityValue, CapabilityValues } from "@shared/capabilities";

const isCapabilityValue = (value: unknown): value is CapabilityValue =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/**
 * Narrow generation params read back from storage into capability values.
 *
 * The one place the wide→narrow transition happens. Stored entries predate any
 * given capability set and are plain JSON, so they can carry anything; the
 * canvas and the draft writer both want `CapabilityValues`. A conversion rather
 * than a cast because the values genuinely are unverified at this point —
 * anything that is not a capability value (a nested object, an array, null) is
 * dropped rather than smuggled through as one.
 *
 * Returns null for an empty or unusable input so callers can keep treating
 * "no params" as null.
 */
export function toCapabilityValues(input: unknown): CapabilityValues | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const narrowed: CapabilityValues = {};
  for (const [key, value] of Object.entries(input)) {
    if (isCapabilityValue(value)) {
      narrowed[key] = value;
    }
  }

  return Object.keys(narrowed).length > 0 ? narrowed : null;
}
