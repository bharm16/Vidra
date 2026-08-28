import { vi } from "vitest";

import { applySharedTestSetup } from "./testSetupShared.js";

applySharedTestSetup({ stubFetch: true });
