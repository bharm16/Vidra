import React from "react";
import { Link } from "react-router-dom";
import { Layers, Eye, Share } from "@promptstudio/system/components/ui";
import { AUTH_COLORS } from "./auth/auth-styles";

const CARD: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
  borderRadius: "10px",
};

const INSET: React.CSSProperties = {
  background: AUTH_COLORS.inputBg,
  border: `1px solid ${AUTH_COLORS.inputBorder}`,
  borderRadius: "8px",
};

interface FeatureRowProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function FeatureRow({
  icon,
  title,
  children,
}: FeatureRowProps): React.ReactElement {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={INSET}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-white">{title}</h3>
        <div
          className="mt-1 space-y-1.5 text-[12px] leading-relaxed"
          style={{ color: AUTH_COLORS.textSecondary }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The four beats of the loop (ADR-0010 state machine: S0-S6). */
const LOOP_STEPS: { label: string; desc: string }[] = [
  {
    label: "Type",
    desc: "— describe your shot in plain words. Vidra expands it into a fuller description you can edit. What you see is exactly what gets made — no hidden rewrites.",
  },
  {
    label: "Picture",
    desc: "— Vidra paints a still from your words. This is the one place to check before spending on motion. Happy? Make it move. Not quite? Edit a phrase and remake.",
  },
  {
    label: "Motion",
    desc: "— turn the picture into a short, looping clip. Re-roll as many times as you like; draft motion is free and watermarked.",
  },
  {
    label: "Keep",
    desc: "— when a clip is right, keep it in HD without the watermark. Download it, or share a link anyone can watch.",
  },
];

/** The space's spine (ADR-0012): words branch into pictures, pictures into clips. */
const SPACE_SPINE = ["Words", "Picture", "Clip"];

export function DocsPage(): React.ReactElement {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: AUTH_COLORS.bg }}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 sm:px-6"
        style={{
          background: AUTH_COLORS.bg,
          borderBottom: `1px solid ${AUTH_COLORS.divider}`,
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p
              className="text-[10px] font-semibold tracking-[0.2em]"
              style={{ color: AUTH_COLORS.textLabel }}
            >
              DOCS
            </p>
            <h1 className="text-[15px] font-semibold tracking-tight text-white">
              How Vidra works
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link
              to="/contact"
              className="inline-flex h-7 items-center rounded-lg px-3 text-[12px] font-semibold transition"
              style={{
                background: AUTH_COLORS.card,
                border: `1px solid ${AUTH_COLORS.cardBorder}`,
                color: AUTH_COLORS.text,
              }}
            >
              Get help
            </Link>
            <Link
              to="/"
              className="text-[12px] font-medium transition-colors hover:text-white"
              style={{ color: AUTH_COLORS.textDim }}
            >
              Back to app
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <p
          className="pb-1 pt-5 text-[13px] leading-relaxed"
          style={{ color: AUTH_COLORS.textSecondary }}
        >
          Vidra turns a sentence into a short video. Type what you&apos;re
          making, get a picture, make it move, and keep the clip you love — all
          on one page.
        </p>

        {/* The loop */}
        <section className="mt-5">
          <div className="p-4" style={CARD}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-white">The loop</h2>
              <span
                className="text-[10px] font-semibold tracking-[0.2em]"
                style={{ color: AUTH_COLORS.textLabel }}
              >
                TYPE · PICTURE · MOTION · KEEP
              </span>
            </div>
            <div
              className="overflow-hidden rounded-lg"
              style={{ border: `1px solid ${AUTH_COLORS.inputBorder}` }}
            >
              {LOOP_STEPS.map((step, i) => (
                <div
                  key={step.label}
                  className="flex items-start gap-3 px-3.5 py-2.5"
                  style={{
                    background: AUTH_COLORS.inputBg,
                    ...(i > 0
                      ? { borderTop: `1px solid ${AUTH_COLORS.inputBorder}` }
                      : {}),
                  }}
                >
                  <span
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      background: AUTH_COLORS.accent,
                      color: AUTH_COLORS.bg,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[12px] leading-relaxed"
                    style={{ color: AUTH_COLORS.textSecondary }}
                  >
                    <strong className="text-white">{step.label}</strong>{" "}
                    {step.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What the space shows */}
        <section className="mt-4">
          <div className="p-4" style={CARD}>
            <h2 className="mb-1 text-[13px] font-semibold text-white">
              What the space shows
            </h2>
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              Every take lands in the space — a living map of your work. Your
              words branch into pictures, pictures into clips, connected by what
              you did to get there: roll a new take, reword the prompt, or move
              the camera. Click any node to revisit it or branch a new
              direction.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {SPACE_SPINE.map((node, i) => (
                <React.Fragment key={node}>
                  {i > 0 ? (
                    <span
                      aria-hidden="true"
                      style={{ color: AUTH_COLORS.textLabel }}
                    >
                      →
                    </span>
                  ) : null}
                  <span
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium"
                    style={{ ...INSET, color: AUTH_COLORS.text }}
                  >
                    {node}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* Good to know */}
        <section className="mt-4">
          <div className="overflow-hidden" style={CARD}>
            <div className="px-4 pb-2 pt-3.5">
              <h2 className="text-[13px] font-semibold text-white">
                Good to know
              </h2>
            </div>
            <div
              className="divide-y"
              style={{ borderColor: AUTH_COLORS.cardBorder }}
            >
              <FeatureRow
                icon={
                  <Layers
                    className="h-3.5 w-3.5"
                    style={{ color: AUTH_COLORS.textDim }}
                    aria-hidden="true"
                  />
                }
                title="Click a phrase"
              >
                <p>
                  Any phrase in your description is clickable for alternative
                  wordings. Camera phrases offer named moves like{" "}
                  <strong className="text-white">dolly in</strong> or{" "}
                  <strong className="text-white">crane up</strong>.
                </p>
              </FeatureRow>
              <FeatureRow
                icon={
                  <Eye
                    className="h-3.5 w-3.5"
                    style={{ color: AUTH_COLORS.textDim }}
                    aria-hidden="true"
                  />
                }
                title="One visible text"
              >
                <p>
                  There is only ever one prompt: the text you can see is the
                  only thing the models receive. Editing it is the way to steer
                  the picture and the motion.
                </p>
              </FeatureRow>
              <FeatureRow
                icon={
                  <Share
                    className="h-3.5 w-3.5"
                    style={{ color: AUTH_COLORS.textDim }}
                    aria-hidden="true"
                  />
                }
                title="Share a clip"
              >
                <p>
                  From a clip&apos;s menu,{" "}
                  <strong className="text-white">Share</strong> copies a public
                  link. Whoever opens it sees just the clip and a way to make
                  their own.
                </p>
              </FeatureRow>
            </div>
          </div>
        </section>

        {/* Help */}
        <section className="mt-4">
          <div
            className="flex items-center justify-between gap-3 p-4"
            style={CARD}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white">Need help?</p>
              <p
                className="mt-0.5 text-[12px]"
                style={{ color: AUTH_COLORS.textSecondary }}
              >
                Questions, bug reports, or feature requests.
              </p>
            </div>
            <Link
              to="/contact"
              className="inline-flex h-8 shrink-0 items-center rounded-lg px-3.5 text-[12px] font-semibold transition"
              style={{ background: AUTH_COLORS.accent, color: AUTH_COLORS.bg }}
            >
              Contact support
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer
          className="mt-8 py-6 text-[12px]"
          style={{
            borderTop: `1px solid ${AUTH_COLORS.cardBorder}`,
            color: AUTH_COLORS.textDim,
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/" className="font-medium text-white hover:underline">
              Go to app
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                to="/privacy-policy"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Privacy
              </Link>
              <Link
                to="/terms-of-service"
                className="hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
