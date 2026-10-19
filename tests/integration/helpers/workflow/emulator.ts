import { randomUUID } from "node:crypto";
import { Firestore } from "firebase-admin/firestore";

/** Required race profile: missing or non-local emulator configuration fails. */
export function createWorkflowTestDatabase(): Firestore {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error("The workflow race profile requires a local FIRESTORE_EMULATOR_HOST; it cannot skip or use production");
  }
  return new Firestore({ projectId: `demo-workflow-${randomUUID().slice(0, 8)}` });
}
