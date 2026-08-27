import { vi } from "vitest";
import fc from "fast-check";

import {
  FAST_CHECK_SEED,
  applyTestEnvDefaults,
  stubGlobalFetch,
} from "./testSetupShared.js";

applyTestEnvDefaults();
fc.configureGlobal({ seed: FAST_CHECK_SEED });
stubGlobalFetch();
