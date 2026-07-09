import React from "react";
import { Link } from "react-router-dom";

import { AmbientLight, Grain, Vignette } from "@/components/atmosphere";

/**
 * Docs — "How it works" (design_handoff_vidra / ADR-0014).
 *
 * Three columns on the cinematic stage: a slim icon rail, an "on this page"
 * table of contents, and the prose. The loop (words → picture → clip) is drawn
 * as a small node diagram. Copy is the handoff's tighter authoring-loop story;
 * links (app, contact, privacy, terms) are preserved from the prior page.
 */

/** Hairline divider from the handoff — rgba(255,255,255,.06). */
const HAIRLINE = "border-white/[0.06]";

/**
 * Accent tint helper — keeps the handoff's color-mix relationship (tints
 * derive from --accent) rather than hardcoding a periwinkle value, so a theme
 * swap recolors these too.
 */
const accentTint = (pct: number, mix = "transparent"): string =>
  `color-mix(in srgb, var(--accent) ${pct}%, ${mix})`;

/** Rightward connector between the workflow beats. */
function WorkflowArrow(): React.ReactElement {
  return (
    <svg
      width="20"
      height="12"
      viewBox="0 0 20 12"
      fill="none"
      stroke="#5a606e"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6h14" />
      <path d="M12 2l4 4-4 4" />
    </svg>
  );
}

const PILL_BASE = "rounded-[10px] px-4 py-[9px] text-[13px]";

/** Neutral workflow beat (Type / Picture / Motion). */
function WorkflowPill({ label }: { label: string }): React.ReactElement {
  return (
    <span
      className={`${PILL_BASE} text-foreground/85 border border-white/[0.14] bg-white/[0.04] font-medium`}
    >
      {label}
    </span>
  );
}

interface TocItemProps {
  href: string;
  label: string;
  active?: boolean;
}

/** A single "on this page" entry; the active one gets the accent spine. */
function TocItem({ href, label, active }: TocItemProps): React.ReactElement {
  return active ? (
    <a
      href={href}
      className="text-foreground border-l-2 border-[color:var(--accent)] py-1.5 pl-3 text-[13px] font-semibold"
    >
      {label}
    </a>
  ) : (
    <a
      href={href}
      className="text-tool-text-muted hover:text-tool-text-secondary py-1.5 pl-3.5 text-[13px] transition-colors"
    >
      {label}
    </a>
  );
}

export function DocsPage(): React.ReactElement {
  return (
    <div className="text-foreground relative isolate flex min-h-[calc(100vh-var(--global-top-nav-height))] w-full overflow-hidden font-sans [background:var(--ps-bg)]">
      {/* Cinematic backdrop (ADR-0014): ambient light + grain behind the
          content (negative z, inside this isolated root); the vignette frames
          over it. */}
      <AmbientLight />
      <Grain />

      {/* Icon rail */}
      <nav
        className={`flex w-16 flex-none flex-col items-center gap-3.5 border-r py-4 ${HAIRLINE}`}
        style={{ background: "#0c0d11" }}
      >
        <Link
          to="/"
          title="Vidra"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
          style={{
            background: "linear-gradient(150deg, var(--accent), #9aa6ff)",
            boxShadow: "0 4px 14px -4px var(--accent)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="#0a0b0e">
            <path d="M3.2 2.4a.6.6 0 0 1 .92-.5l5 3.6a.6.6 0 0 1 0 1l-5 3.6a.6.6 0 0 1-.92-.5z" />
          </svg>
        </Link>

        <Link
          to="/"
          title="Back to app"
          className="text-tool-text-muted hover:text-foreground flex h-[38px] w-[38px] items-center justify-center rounded-[10px] transition-colors hover:bg-white/[0.06]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        <div
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px]"
          style={{ background: accentTint(16), color: accentTint(70, "#fff") }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
            <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5z" />
          </svg>
        </div>

        <div className="flex-1" />

        <span
          className="h-8 w-8 rounded-full border border-white/[0.16]"
          style={{ background: "linear-gradient(150deg, #f4d3a2, #e6b487)" }}
        />
      </nav>

      {/* Table of contents */}
      <aside
        className={`w-[222px] flex-none border-r px-[22px] py-[30px] ${HAIRLINE}`}
      >
        <div className="text-tool-text-placeholder mb-[15px] font-mono text-[10px] font-semibold uppercase tracking-[0.16em]">
          On this page
        </div>
        <div className="flex flex-col gap-0.5">
          <TocItem href="#the-workflow" label="The workflow" active />
          <TocItem href="#editing-phrases" label="Editing phrases" />
          <TocItem href="#what-the-space-shows" label="What the space shows" />
        </div>
      </aside>

      {/* Prose */}
      <main className="min-w-0 flex-1 px-[56px] py-[46px]">
        <h1 className="text-foreground text-[30px] font-semibold tracking-[-0.02em]">
          How it works
        </h1>
        <p className="text-tool-text-muted mt-2 max-w-[560px] text-[14.5px] leading-[1.55]">
          Type an idea, shape it into a picture, set it moving, keep what you
          love.
        </p>

        {/* The workflow */}
        <section id="the-workflow" className="scroll-mt-24">
          <h2 className="text-foreground mt-[34px] text-[17px] font-semibold">
            The workflow
          </h2>
          <div className="mt-[15px] flex items-center gap-2.5">
            <WorkflowPill label="Type" />
            <WorkflowArrow />
            <WorkflowPill label="Picture" />
            <WorkflowArrow />
            <WorkflowPill label="Motion" />
            <WorkflowArrow />
            <span
              className={`${PILL_BASE} font-semibold`}
              style={{
                border: "1px solid rgba(63,191,111,0.4)",
                background: "rgba(63,191,111,0.12)",
                color: "#68d492",
              }}
            >
              Keep
            </span>
          </div>
          <p className="text-tool-text-subdued mt-[14px] max-w-[560px] text-[13.5px] leading-[1.65]">
            Start by typing an idea. It becomes a still picture, which you can
            then set in motion as a short clip, and finally keep. Each step
            waits for you &mdash; nothing advances on its own, and you can
            re-roll or edit at any point.
          </p>
        </section>

        {/* Editing phrases */}
        <section id="editing-phrases" className="scroll-mt-24">
          <h2 className="text-foreground mt-[30px] text-[17px] font-semibold">
            Editing phrases
          </h2>
          <div className="text-foreground/90 mt-[13px] max-w-[560px] rounded-[12px] border border-white/[0.10] bg-white/[0.03] px-4 py-[14px] text-[15px] leading-[1.6]">
            A{" "}
            <span
              style={{
                color: "#e2b866",
                borderBottom:
                  "1.6px dashed color-mix(in srgb, #e2b866 60%, transparent)",
              }}
            >
              drone shot pulling back
            </span>{" "}
            over a{" "}
            <span
              style={{
                background: accentTint(20),
                boxShadow: "inset 0 -1.6px var(--accent)",
                borderRadius: "3px",
                padding: "0 3px",
              }}
            >
              coastal town
            </span>{" "}
            at{" "}
            <span
              style={{
                background: accentTint(20),
                boxShadow: "inset 0 -1.6px var(--accent)",
                borderRadius: "3px",
                padding: "0 3px",
              }}
            >
              dawn
            </span>
          </div>
          <p className="text-tool-text-subdued mt-[13px] max-w-[560px] text-[13.5px] leading-[1.65]">
            Your description stays editable throughout.{" "}
            <span className="text-foreground/80">Highlighted phrases</span> open
            a few alternatives &mdash; or type your own.{" "}
            <span style={{ color: "#e2b866" }}>Motion phrases</span> describe
            camera or subject movement; they read differently and don&rsquo;t
            change the still picture. The &ldquo;your words&rdquo; control
            always holds your original line.
          </p>
        </section>

        {/* What the space shows */}
        <section id="what-the-space-shows" className="scroll-mt-24">
          <h2 className="text-foreground mt-[30px] text-[17px] font-semibold">
            What the space shows
          </h2>
          <div className="mt-[14px] flex items-center gap-[22px]">
            <svg width="316" height="72" viewBox="0 0 316 72" fill="none">
              <path d="M42,36 L104,36" stroke="#5b6cff" strokeWidth="2.2" />
              <path
                d="M42,36 C74,36 70,15 104,15"
                stroke="rgba(255,255,255,.18)"
                strokeWidth="1.5"
              />
              <path
                d="M42,36 C74,36 70,57 104,57"
                stroke="#c2a24e"
                strokeWidth="1.5"
                strokeDasharray="5 3"
              />
              <path d="M160,36 L222,36" stroke="#5b6cff" strokeWidth="2.4" />
              <path d="M278,36 L304,36" stroke="#3fbf6f" strokeWidth="2.4" />
              <rect
                x="6"
                y="24"
                width="36"
                height="24"
                rx="6"
                fill="#14161c"
                stroke="rgba(255,255,255,.16)"
              />
              <rect
                x="104"
                y="5"
                width="56"
                height="20"
                rx="5"
                fill="#14161c"
                stroke="rgba(255,255,255,.14)"
              />
              <rect
                x="104"
                y="47"
                width="56"
                height="20"
                rx="5"
                fill="#191509"
                stroke="rgba(211,164,78,.4)"
              />
              <rect
                x="104"
                y="24"
                width="56"
                height="24"
                rx="6"
                fill="#161821"
                stroke="#5b6cff"
                strokeWidth="1.6"
              />
              <rect
                x="222"
                y="24"
                width="56"
                height="24"
                rx="6"
                fill="#161821"
                stroke="#5b6cff"
                strokeWidth="1.6"
              />
              <rect
                x="304"
                y="26"
                width="10"
                height="20"
                rx="4"
                fill="#12211a"
                stroke="#3fbf6f"
                strokeWidth="1.6"
              />
            </svg>
            <div className="text-tool-text-subdued flex flex-col gap-[7px] font-mono text-[11.5px]">
              <span className="flex items-center gap-2">
                <svg width="20" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="20"
                    y2="2"
                    stroke="#5b6cff"
                    strokeWidth="2.4"
                  />
                </svg>
                move
              </span>
              <span className="flex items-center gap-2">
                <svg width="20" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="20"
                    y2="2"
                    stroke="rgba(255,255,255,.2)"
                    strokeWidth="1.5"
                  />
                </svg>
                roll
              </span>
              <span className="flex items-center gap-2">
                <svg width="20" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="20"
                    y2="2"
                    stroke="#c2a24e"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                </svg>
                reword
              </span>
            </div>
          </div>
          <p className="text-tool-text-subdued mt-[15px] max-w-[560px] text-[13.5px] leading-[1.65]">
            Everything you make lives in one space, in three columns &mdash;
            words, pictures, clips &mdash; connected by what you did. The node
            you&rsquo;re viewing is the live one; selecting any node brings its
            words back into the input.
          </p>
        </section>

        {/* Preserved links (app, support, legal). */}
        <footer
          className={`mt-[42px] flex max-w-[560px] flex-wrap items-center gap-x-5 gap-y-2 border-t pt-6 text-[12.5px] ${HAIRLINE}`}
        >
          <Link
            to="/contact"
            className="text-tool-text-muted hover:text-foreground transition-colors"
          >
            Contact support
          </Link>
          <Link
            to="/privacy-policy"
            className="text-tool-text-muted hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          <Link
            to="/terms-of-service"
            className="text-tool-text-muted hover:text-foreground transition-colors"
          >
            Terms
          </Link>
        </footer>
      </main>

      {/* Vignette frames over the content (pointer-events: none). */}
      <Vignette intensity="default" />
    </div>
  );
}
