import React from "react";
import { Link, useNavigate } from "react-router-dom";

import { Avatar, Badge } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { getAuthRepository } from "@repositories/index";
import { useToast } from "@components/Toast";
import { useAuthUser } from "@hooks/useAuthUser";
import type { User } from "@features/prompt-optimizer";

import { AmbientLight, Grain, Vignette } from "@/components/atmosphere";
import { NavRail } from "@/components/navigation/NavRail";

import { AccountSettingsNav } from "./account/AccountSettingsNav";
import {
  PLACEHOLDER_MINI_BARS,
  PLACEHOLDER_MINI_PEAK_INDEX,
  PLACEHOLDER_USAGE_BARS,
  PLACEHOLDER_USAGE_PEAK_INDEX,
  type AccountSection,
} from "./account/constants";
import {
  AccountCard,
  ChartAxis,
  Eyebrow,
  StatCard,
  UsageBars,
} from "./account/primitives";

/**
 * Account (design_handoff_vidra/Account.dc.html · ADR-0014).
 *
 * A [236px settings sub-nav | section content] split on the cinematic stage.
 * The sub-nav switches between Personal profile, Subscription, and Usage and
 * anchors Sign out at the bottom. The app-level nav rail that wraps this screen
 * is a separate task (see AccountSettingsNav) — this file builds page content.
 *
 * Personal profile carries the real account data + actions (identity, email
 * verification, reset password, sign out). Subscription and Usage are visual
 * placeholders: Vidra has no credit/usage data and billing is frozen
 * (ADR-0002, ADR-0010) — see account/constants.ts.
 */

function formatUserLabel(user: User): { title: string; subtitle: string } {
  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const emailPrefix = email.split("@")[0] ?? "";
  const title = displayName || emailPrefix || "Account";
  return {
    title,
    subtitle: email ? email : "Signed in",
  };
}

interface PersonalProfileSectionProps {
  title: string;
  emailLabel: string;
  avatarInitial: string;
  isVerified: boolean;
  resetPasswordLink: string;
  isBusy: boolean;
  onResend: () => void;
}

/**
 * Personal profile — the real identity surface. Name, email, and the
 * verification badge are live user data; the credits / usage-history / activity
 * cards below are placeholders that mirror the handoff until real data exists.
 */
function PersonalProfileSection({
  title,
  emailLabel,
  avatarInitial,
  isVerified,
  resetPasswordLink,
  isBusy,
  onResend,
}: PersonalProfileSectionProps): React.ReactElement {
  return (
    <section className="flex flex-col">
      <div className="flex items-center gap-5">
        <Avatar
          size="xl"
          fallback={avatarInitial}
          className="h-[74px] w-[74px] border border-white/[0.16] text-[26px]"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-foreground text-[25px] font-semibold tracking-[-0.015em]">
              {title}
            </h1>
            <Badge variant={isVerified ? "success" : "warning"} size="sm">
              {isVerified ? "Verified" : "Not verified"}
            </Badge>
          </div>
          <div className="text-tool-text-muted mt-[7px] text-[13.5px]">
            {emailLabel}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            {!isVerified ? (
              <Button
                type="button"
                variant="outline"
                onClick={onResend}
                disabled={isBusy}
                className="!h-auto rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
              >
                Resend verification
              </Button>
            ) : null}
            <Link
              to={resetPasswordLink}
              className="text-tool-text-muted hover:text-foreground text-[12px] font-semibold transition-colors hover:underline"
            >
              Reset password
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-[26px] flex gap-[18px]">
        <AccountCard className="flex min-h-[140px] flex-1 flex-col px-5 py-[18px]">
          <Eyebrow>Credits</Eyebrow>
          <div className="flex-1" />
          <div className="flex items-end justify-between">
            <div>
              <div className="text-foreground text-[24px] font-semibold">
                10 left
              </div>
              <div className="text-tool-text-subdued mt-[3px] text-[11.5px]">
                of your monthly pool
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="!h-auto rounded-[10px] px-[15px] py-[9px] text-[12.5px] font-medium"
            >
              Top up
            </Button>
          </div>
        </AccountCard>

        <AccountCard className="flex min-h-[140px] flex-1 flex-col px-5 py-[18px]">
          <div className="flex items-center justify-between">
            <Eyebrow>Usage history</Eyebrow>
            <span
              className="text-[11.5px] font-medium"
              style={{ color: "color-mix(in srgb, var(--accent) 55%, white)" }}
            >
              See all
            </span>
          </div>
          <UsageBars
            heights={PLACEHOLDER_MINI_BARS}
            peakIndex={PLACEHOLDER_MINI_PEAK_INDEX}
            className="mt-3.5 flex-1"
          />
          <ChartAxis className="mt-2" />
        </AccountCard>
      </div>

      <div className="text-foreground mt-7 text-[14px] font-semibold">
        Activity
      </div>
      <div className="mt-3 flex gap-4">
        <StatCard value="12" label="Clips made" />
        <StatCard value="12" label="This month" />
      </div>
    </section>
  );
}

/**
 * Subscription — visual placeholder. Vidra has no live plan or credit data and
 * billing is frozen (ADR-0002, ADR-0010); this mirrors the handoff so the
 * layout reads correctly. The plan/credit/invoice controls are not wired.
 */
function SubscriptionSection(): React.ReactElement {
  return (
    <section className="flex flex-col">
      <h1 className="text-foreground text-[23px] font-semibold tracking-[-0.015em]">
        Subscription
      </h1>
      <p className="text-tool-text-muted mt-1.5 text-[13.5px]">
        Manage your plan and credits.
      </p>

      <AccountCard className="mt-[22px] flex items-center justify-between px-[22px] py-5">
        <div>
          <div className="text-foreground text-[18px] font-semibold">
            Free plan
          </div>
          <div className="text-tool-text-muted mt-1 text-[13px]">
            Unlock longer clips and keep more of what you make.
          </div>
        </div>
        <Button className="!h-auto rounded-[11px] px-5 py-3 text-[13.5px] font-semibold">
          Upgrade plan
        </Button>
      </AccountCard>

      <AccountCard className="mt-4 px-[22px] py-5">
        <Eyebrow>Credits</Eyebrow>
        <div className="mt-2.5 flex items-end justify-between">
          <div>
            <div className="text-tool-text-subdued text-[11.5px]">
              Monthly credits left
            </div>
            <div className="text-foreground mt-[3px] text-[23px] font-semibold">
              10 / 10
            </div>
          </div>
          <Button
            variant="secondary"
            className="!h-auto rounded-[10px] px-[15px] py-[9px] text-[12.5px] font-medium"
          >
            + Buy credits
          </Button>
        </div>
        <div className="mt-[15px] h-[7px] overflow-hidden rounded-[4px] bg-white/[0.08]">
          <div
            className="h-full w-full rounded-[4px]"
            style={{ background: "var(--accent)" }}
          />
        </div>
      </AccountCard>

      <div className="text-foreground mt-[26px] text-[14px] font-semibold">
        Billing history
      </div>
      <div className="mt-3 rounded-[13px] border border-dashed border-white/[0.14] px-8 py-[34px] text-center">
        <div className="text-tool-text-muted text-[13.5px]">
          No invoices yet
        </div>
        <div className="text-tool-text-subdued mt-1 text-[11.5px]">
          Receipts appear here after your first payment.
        </div>
      </div>
    </section>
  );
}

/**
 * Usage — visual placeholder. Same rationale as Subscription: no live usage
 * data exists yet, so the stat tiles and daily-credits chart render the
 * handoff's mock figures from account/constants.ts.
 */
function UsageSection(): React.ReactElement {
  return (
    <section className="flex flex-col">
      <h1 className="text-foreground text-[23px] font-semibold tracking-[-0.015em]">
        Usage
      </h1>
      <p className="text-tool-text-muted mt-1.5 text-[13.5px]">
        Credits spent over the last 30 days.
      </p>

      <div className="mt-[22px] flex gap-4">
        <StatCard value="38" label="Credits used" />
        <StatCard value="12" label="Clips generated" />
        <StatCard value="1.3" label="Avg / day" />
      </div>

      <AccountCard className="mt-4 px-[22px] py-5">
        <Eyebrow className="mb-4">Daily credits</Eyebrow>
        <UsageBars
          heights={PLACEHOLDER_USAGE_BARS}
          peakIndex={PLACEHOLDER_USAGE_PEAK_INDEX}
          className="h-[150px]"
        />
        <ChartAxis className="mt-2.5" />
      </AccountCard>
    </section>
  );
}

export function AccountPage(): React.ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [isBusy, setIsBusy] = React.useState(false);
  const [section, setSection] = React.useState<AccountSection>("profile");
  const user = useAuthUser();

  const handleSignOut = async (): Promise<void> => {
    setIsBusy(true);
    try {
      await getAuthRepository().signOut();
      toast.success("Signed out successfully");
      navigate("/signin", { replace: true });
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setIsBusy(false);
    }
  };

  const handleResendVerification = async (): Promise<void> => {
    if (!user) return;
    setIsBusy(true);
    try {
      await getAuthRepository().sendVerificationEmail("/account");
      toast.success("Verification email sent.");
    } catch {
      toast.error("Failed to send verification email.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="text-foreground relative isolate flex min-h-[calc(100vh-var(--global-top-nav-height))] w-full items-center justify-center overflow-hidden font-sans [background:var(--ps-bg)]">
        <AmbientLight />
        <Grain />
        <main className="relative mx-auto flex w-full max-w-sm flex-col gap-4 px-6">
          <h1 className="text-foreground text-[22px] font-semibold tracking-[-0.015em]">
            You&apos;re not signed in
          </h1>
          <p className="text-tool-text-muted text-[13.5px] leading-relaxed">
            Sign in to sync your sessions and pick up where you left off across
            devices.
          </p>
          <div className="flex flex-col gap-2.5">
            <Button asChild className="w-full">
              <Link to="/signin">Sign in</Link>
            </Button>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/signup">Create account</Link>
            </Button>
          </div>
        </main>
        <Vignette intensity="default" />
      </div>
    );
  }

  const label = formatUserLabel(user);
  const avatarInitial = label.title.charAt(0).toUpperCase();
  const email = typeof user.email === "string" ? user.email : "";
  const isVerified =
    typeof user.emailVerified === "boolean" ? user.emailVerified : false;
  const resetPasswordLink = email
    ? `/forgot-password?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent("/account")}`
    : `/forgot-password?redirect=${encodeURIComponent("/account")}`;

  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail active="account" />
      <div className="text-foreground relative isolate flex h-full min-w-0 flex-1 overflow-hidden font-sans [background:var(--ps-bg)]">
        <AmbientLight />
        <Grain />

        <AccountSettingsNav
          active={section}
          onSelect={setSection}
          onSignOut={handleSignOut}
          isSigningOut={isBusy}
        />

        <main className="min-w-0 flex-1 overflow-y-auto px-10 py-[34px]">
          {section === "profile" ? (
            <PersonalProfileSection
              title={label.title}
              emailLabel={label.subtitle}
              avatarInitial={avatarInitial}
              isVerified={isVerified}
              resetPasswordLink={resetPasswordLink}
              isBusy={isBusy}
              onResend={handleResendVerification}
            />
          ) : null}
          {section === "subscription" ? <SubscriptionSection /> : null}
          {section === "usage" ? <UsageSection /> : null}
        </main>

        <Vignette intensity="default" />
      </div>
    </div>
  );
}
