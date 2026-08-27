import { applyTestEnvDefaults } from "./testSetupShared.js";

applyTestEnvDefaults();

// Default the firebase-integration gate ON. Billing/credit tests still
// also require FIRESTORE_EMULATOR_HOST (which CI sets). Defaulting only
// RUN_FIREBASE_INTEGRATION=true means a dev with the emulator running
// locally no longer needs the extra env var — the silent-green-skip when
// neither was set is the failure mode the audit flagged. Opt out with
// RUN_FIREBASE_INTEGRATION=false. We deliberately do NOT default
// FIRESTORE_EMULATOR_HOST so non-billing integration tests (bootstrap,
// di-container) still hit the in-memory firebase admin shim used in
// NODE_ENV=test.
process.env.RUN_FIREBASE_INTEGRATION =
  process.env.RUN_FIREBASE_INTEGRATION ?? "true";
