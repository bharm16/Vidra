import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import { AuthRepository } from "../AuthRepository";
const update = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
vi.mock("firebase/auth", () => ({ GoogleAuthProvider: class {}, updateProfile: update, sendEmailVerification: send }));
const user = { uid: "creator", email: "creator@example.com", displayName: "Creator", emailVerified: true, providerData: [{ providerId: "google.com" }, { providerId: "password" }, { providerId: "google.com" }] };
beforeEach(() => { vi.resetAllMocks(); update.mockResolvedValue(undefined); send.mockResolvedValue(undefined); });
describe("Firebase account profile operations", () => {
  it("updates only a validated name on the captured authenticated user", async () => {
    const auth = { currentUser: user } as unknown as Auth;
    await new AuthRepository(auth).updateDisplayName("creator", " New name ");
    expect(update).toHaveBeenCalledWith(user, { displayName: "New name" });
  });
  it("rejects signed-out and foreign user mutations without calling Firebase", async () => {
    await expect(new AuthRepository({ currentUser: null } as unknown as Auth).updateDisplayName("creator", "Name")).rejects.toThrow("Sign in");
    await expect(new AuthRepository({ currentUser: user } as unknown as Auth).updateDisplayName("other", "Name")).rejects.toThrow("Sign in");
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects blank and overlong names at the persistence boundary", async () => {
    const repo = new AuthRepository({ currentUser: user } as unknown as Auth);
    await expect(repo.updateDisplayName("creator", " ")).rejects.toThrow();
    await expect(repo.updateDisplayName("creator", "a".repeat(81))).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
  it("does not return a previous owner's profile after an account switch", async () => {
    const state = { currentUser: user };
    update.mockImplementation(async () => { state.currentUser = { ...user, uid: "other" }; });
    await expect(new AuthRepository(state as unknown as Auth).updateDisplayName("creator", "Private name")).rejects.toThrow("could not be saved");
  });
  it("reads linked providers without inferring a password from an email address", () => {
    const repo = new AuthRepository({ currentUser: user } as unknown as Auth);
    expect(repo.getSignInMethods("creator")).toEqual(["google.com", "password"]);
    expect(repo.getSignInMethods("other")).toEqual([]);
    expect(new AuthRepository({ currentUser: { ...user, providerData: [{ providerId: "google.com" }] } } as unknown as Auth).getSignInMethods("creator")).toEqual(["google.com"]);
  });
  it("refuses to send verification for a stale owner", async () => {
    const repo = new AuthRepository({ currentUser: user } as unknown as Auth);
    await expect(repo.sendVerificationEmail("/account", "other")).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
