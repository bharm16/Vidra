/**
 * Repository Provider
 *
 * Central place to create and access repository instances
 * Implements the Service Locator pattern for repositories
 */

import { getFirebaseAuth } from "../config/firebase";
import { setSentryUser, addSentryBreadcrumb } from "../config/sentry";
import { AuthRepository, MockAuthRepository } from "./AuthRepository";
import { PromptRepository } from "./PromptRepository";
import { LocalStoragePromptRepository } from "./LocalStoragePromptRepository";
import type { SentryIntegration } from "./AuthRepository";

// Sentry integration adapter
const sentryAdapter: SentryIntegration = {
  setUser: setSentryUser,
  addBreadcrumb: addSentryBreadcrumb,
};

// Singleton instances
let authRepository: AuthRepository | null = null;
let promptRepository: PromptRepository | null = null;
let localPromptRepository: LocalStoragePromptRepository | null = null;

/**
 * Get the auth repository instance
 */
export function getAuthRepository(): AuthRepository {
  if (!authRepository) {
    // E2E test hook: use MockAuthRepository when test global is set
    const win =
      typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>)
        : undefined;
    if (win?.__E2E_AUTH_USER__) {
      const mockRepo = new MockAuthRepository();
      const user = win.__E2E_AUTH_USER__ as Record<string, unknown>;
      void mockRepo.signInWithEmail(
        (user.email as string) ?? "test@example.com",
        "e2e-password",
      );
      authRepository = mockRepo as unknown as AuthRepository;
      return authRepository;
    }
    authRepository = new AuthRepository(getFirebaseAuth(), sentryAdapter);
  }
  return authRepository;
}

/**
 * Get the prompt repository instance (Firestore)
 */
export function getPromptRepository(): PromptRepository {
  if (!promptRepository) {
    promptRepository = new PromptRepository();
  }
  return promptRepository;
}

/**
 * Get the local prompt repository instance (localStorage)
 */
export function getLocalPromptRepository(): LocalStoragePromptRepository {
  if (!localPromptRepository) {
    localPromptRepository = new LocalStoragePromptRepository();
  }
  return localPromptRepository;
}

/**
 * Get appropriate prompt repository based on auth state
 */
export function getPromptRepositoryForUser(
  isAuthenticated: boolean,
): PromptRepository | LocalStoragePromptRepository {
  return isAuthenticated ? getPromptRepository() : getLocalPromptRepository();
}

/**
 * Reset all repository instances (useful for testing)
 */
export function resetRepositories(): void {
  authRepository = null;
  promptRepository = null;
  localPromptRepository = null;
}
