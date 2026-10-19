import { useEffect, useRef, useState } from "react";
import { getAuthRepository } from "@repositories/index";
import type { User } from "@hooks/types";

type Operation = "name" | "verification" | "reset";
interface ProfileOperation { kind: Operation; ownerId: string; }
interface Notice { ownerId: string; kind: Operation; tone: "error" | "success"; message: string; }
export function useAccountProfile(user: User | null): {
  profile: User | null;
  busy: Operation | undefined;
  notice: Notice | undefined;
  cooldown: number;
  resetCooldown: number;
  saveName: (name: string) => Promise<boolean>;
  sendVerification: () => Promise<void>;
  sendReset: () => Promise<void>;
  clearNotice: () => void;
} {
  const currentOwner = useRef(user?.uid);
  currentOwner.current = user?.uid;
  const operation = useRef(0);
  const [updated, setUpdated] = useState<{ ownerId: string; user: User }>();
  const [pending, setPending] = useState<ProfileOperation>();
  const [notice, setNotice] = useState<Notice>();
  const [resendAt, setResendAt] = useState<{ ownerId: string; at: number }>();
  const [resetAt, setResetAt] = useState<{ ownerId: string; at: number }>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { operation.current += 1; setPending(undefined); return () => { operation.current += 1; }; }, [user?.uid]);
  useEffect(() => { if (![resendAt, resetAt].some(deadline => deadline !== undefined && deadline.ownerId === user?.uid && deadline.at > now)) return; const timer = window.setTimeout(() => setNow(Date.now()), 1000); return () => window.clearTimeout(timer); }, [resendAt, resetAt, now, user?.uid]);
  const run = async (kind: Operation, action: (ownerId: string) => Promise<void>): Promise<boolean> => {
    if (!user || pending?.ownerId === user.uid) return false;
    const ownerId = user.uid;
    const token = ++operation.current;
    setPending({ ownerId, kind }); setNotice(undefined);
    try {
      await action(ownerId);
      if (currentOwner.current !== ownerId || token !== operation.current) return false;
      if (kind === "verification") { setResendAt({ ownerId, at: Date.now() + 60_000 }); setNow(Date.now()); setNotice({ ownerId, kind, tone: "success", message: "A new verification link is on its way." }); }
      if (kind === "reset") { setResetAt({ ownerId, at: Date.now() + 60_000 }); setNow(Date.now()); setNotice({ ownerId, kind, tone: "success", message: "Check your inbox for password reset instructions." }); }
      return true;
    } catch {
      if (currentOwner.current === ownerId && token === operation.current) setNotice({ ownerId, kind, tone: "error", message: kind === "name" ? "Your name could not be saved. Check your connection and try again." : "The email could not be requested. Check your connection and try again." });
      return false;
    } finally { if (currentOwner.current === ownerId && token === operation.current) setPending(undefined); }
  };
  return {
    profile: updated && updated.ownerId === user?.uid ? updated.user : user,
    busy: pending?.ownerId === user?.uid ? pending?.kind : undefined,
    notice: notice?.ownerId === user?.uid ? notice : undefined,
    cooldown: resendAt && resendAt.ownerId === user?.uid ? Math.max(0, Math.ceil((resendAt.at - now) / 1000)) : 0,
    resetCooldown: resetAt && resetAt.ownerId === user?.uid ? Math.max(0, Math.ceil((resetAt.at - now) / 1000)) : 0,
    saveName: name => run("name", async ownerId => { const result = await getAuthRepository().updateDisplayName(ownerId, name); if (currentOwner.current === ownerId) setUpdated({ ownerId, user: result }); }),
    sendVerification: async () => { if (resendAt && resendAt.ownerId === user?.uid && resendAt.at > Date.now()) return; await run("verification", ownerId => getAuthRepository().sendVerificationEmail("/account", ownerId)); },
    sendReset: async () => { const email = user?.email; if (typeof email !== "string" || !email || (resetAt?.ownerId === user?.uid && resetAt.at > Date.now())) return; await run("reset", () => getAuthRepository().sendPasswordReset(email, "/account?section=security")); },
    clearNotice: () => setNotice(undefined),
  };
}
