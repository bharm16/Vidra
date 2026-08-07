import { getFirebaseAuth } from "@/config/firebase";
import { onAuthStateChanged } from "firebase/auth";

const FIREBASE_TOKEN_HEADER = "X-Firebase-Token";
const API_KEY_HEADER = "X-API-Key";
const DEV_FALLBACK_API_KEY = "dev-key-12345";
const AUTH_READY_TIMEOUT_MS = 3000;

let authReadyPromise: Promise<void> | null = null;

export const waitForAuthReady = async (): Promise<void> => {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, AUTH_READY_TIMEOUT_MS);
      const unsubscribe = onAuthStateChanged(
        getFirebaseAuth(),
        () => {
          clearTimeout(timeoutId);
          resolve();
          unsubscribe();
        },
        () => {
          clearTimeout(timeoutId);
          resolve();
          unsubscribe();
        },
      );
    });
  }

  await authReadyPromise;
};

export async function getFirebaseToken(): Promise<string | null> {
  await waitForAuthReady();
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    return null;
  }

  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function buildFirebaseAuthHeaders(): Promise<
  Record<string, string>
> {
  await waitForAuthReady();
  const isProduction =
    (import.meta as { env?: { MODE?: string } }).env?.MODE === "production";
  const devFallbackHeaders = isProduction
    ? {}
    : { [API_KEY_HEADER]: DEV_FALLBACK_API_KEY };
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    return devFallbackHeaders;
  }

  try {
    const token = await user.getIdToken();
    if (!token) {
      return devFallbackHeaders;
    }
    return {
      [FIREBASE_TOKEN_HEADER]: token,
      ...devFallbackHeaders,
    };
  } catch {
    return devFallbackHeaders;
  }
}
