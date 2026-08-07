import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import type { Analytics } from "firebase/analytics";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";

const log = logger.child("firebase");

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/**
 * Firebase services, constructed on first use rather than on import.
 *
 * `getAuth` throws `auth/invalid-api-key` when VITE_FIREBASE_API_KEY is absent.
 * While these were module-level constants, that throw happened at import time,
 * so any module transitively importing this one failed to load without
 * credentials — taking down 88 test files in CI that never touch Firebase at
 * all. Importing is now free; only actually asking for a service can fail, and
 * only in code paths that genuinely need one.
 *
 * Every accessor memoizes, so callers still share one instance.
 */

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let analyticsInstance: Analytics | null = null;

function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig);
    startAnalyticsLoad(app);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  authInstance ??= getAuth(getApp());
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  // Memory-only local cache. Default IndexedDB persistence triggers a known
  // Firestore 12.4.0 bug (`INTERNAL ASSERTION FAILED: Unexpected state
  // (ID: ca9) CONTEXT: {ve:-1}`) on watch-stream resumes — it spams the
  // console 30+ times per sign-in and makes debugging impossible. Memory
  // cache is fine for this app: we use REST polling for stateful data
  // (credits, sessions) and only use Firestore for live listeners.
  dbInstance ??= initializeFirestore(getApp(), {
    localCache: memoryLocalCache(),
  });
  return dbInstance;
}

/**
 * Null until the analytics bundle resolves, and permanently null when it
 * cannot load (SSR, dev, ad blockers). Callers must handle null — the loading
 * window is real, not a formality.
 */
export function getFirebaseAnalytics(): Analytics | null {
  getApp();
  return analyticsInstance;
}

function startAnalyticsLoad(firebaseApp: FirebaseApp): void {
  if (typeof window === "undefined") {
    return;
  }

  import("firebase/analytics")
    .then(({ getAnalytics }) => {
      analyticsInstance = getAnalytics(firebaseApp);
    })
    .catch((error) => {
      const info = sanitizeError(error);
      log.warn("Firebase Analytics initialization failed (ok in development)", {
        operation: "getAnalytics",
        error: info.message,
        errorName: info.name,
      });
    });
}
