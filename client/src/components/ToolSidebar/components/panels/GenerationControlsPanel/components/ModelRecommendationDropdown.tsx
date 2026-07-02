import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CaretDown,
  Star,
  WarningCircle,
  X,
} from "@promptstudio/system/components/ui";
import {
  VIDEO_DRAFT_MODEL,
  VIDEO_RENDER_MODELS,
  getVideoCost,
} from "@components/ToolSidebar/config/modelConfig";
import { cn } from "@/utils/cn";
import { resolveModelMeta } from "@/config/videoModels";
import type { ModelRecommendation } from "@/features/model-intelligence/types";
import { normalizeModelIdForSelection } from "@/features/model-intelligence/utils/modelLabels";

/* ───────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────── */

interface ModelEntry {
  id: string;
  label: string;
  creditsPerSecond: number;
  badge: "draft" | "render";
  badgeColor: string;
}

interface RecInfo {
  matchPct: number;
  isTop: boolean;
  isEfficient: boolean;
}

interface UnavailableEntry {
  id: string;
  label: string;
  reason: string;
}

const REASON_LABELS: Record<string, string> = {
  insufficient_credits: "Need more credits",
  missing_credentials: "Not configured",
  unsupported_model: "Unsupported",
  image_input_unsupported: "No image input",
  not_entitled: "Not entitled",
  video_generation_unavailable: "Unavailable",
  unavailable: "Unavailable",
  unknown_availability: "Checking…",
};

const formatReasonLabel = (reason: string): string =>
  REASON_LABELS[reason] ?? "Unavailable";

export interface ModelRecommendationDropdownProps {
  renderModelOptions: Array<{ id: string; label: string }>;
  renderModelId: string;
  onModelChange: (model: string) => void;
  modelRecommendation?: ModelRecommendation | null | undefined;
  recommendedModelId?: string | undefined;
  efficientModelId?: string | undefined;
  filteredOut?: Array<{ modelId: string; reason: string }> | undefined;
  triggerClassName?: string | undefined;
  triggerPrefixLabel?: string | undefined;
  /** Optional icon node rendered before the label (e.g. the bullseye/Target
   *  icon used by the canvas composer chip). The component receives it as a
   *  React node so the caller controls icon size and weight. */
  triggerPrefixIcon?: React.ReactNode;
  triggerAriaLabel?: string | undefined;
}

/** closed = nothing visible, list = hover popover, cards = click overlay */
type ViewMode = "closed" | "list" | "cards";

/* ───────────────────────────────────────────────────────
   Data helpers (unchanged from original)
   ─────────────────────────────────────────────────────── */

const buildModelEntries = (
  opts: Array<{ id: string; label: string }>,
): ModelEntry[] => {
  const labels = new Map(opts.map((o) => [o.id, o.label]));
  const hasFilter = labels.size > 0;
  const renders = VIDEO_RENDER_MODELS.filter(
    (m) => !hasFilter || labels.has(m.id),
  ).map((m) => ({
    ...m,
    label: labels.get(m.id) ?? m.label,
    badge: "render" as const,
    badgeColor: "#6C5CE7",
  }));
  return [
    { ...VIDEO_DRAFT_MODEL, badge: "draft" as const, badgeColor: "#4ADE80" },
    ...renders,
  ];
};

function buildRecMap(
  models: ModelEntry[],
  rec: ModelRecommendation | null | undefined,
  recId: string | undefined,
  effId: string | undefined,
  filtered: Array<{ modelId: string; reason: string }> | undefined,
) {
  const map = new Map<string, RecInfo>();
  const unavail: UnavailableEntry[] = [];

  if (rec?.recommendations) {
    const sorted = [...rec.recommendations].sort(
      (a, b) => b.overallScore - a.overallScore,
    );
    const topRecommendations = sorted.slice(0, 3);
    for (let i = 0; i < topRecommendations.length; i++) {
      const r = topRecommendations[i];
      if (!r) continue;
      const nId = normalizeModelIdForSelection(r.modelId);
      if (!models.find((m) => m.id === nId)) continue;
      map.set(nId, {
        matchPct: Math.round(r.overallScore),
        isTop: i === 0,
        isEfficient: nId === effId,
      });
    }
  }
  if (map.size === 0 && recId) {
    if (models.find((m) => m.id === recId)) {
      map.set(recId, {
        matchPct: 85,
        isTop: true,
        isEfficient: recId === effId,
      });
    }
  }
  if (filtered?.length) {
    const seenIds = new Set<string>();
    for (const e of filtered) {
      const nId = normalizeModelIdForSelection(e.modelId);
      if (seenIds.has(nId)) continue;
      seenIds.add(nId);
      unavail.push({
        id: nId,
        label: models.find((m) => m.id === nId)?.label ?? nId,
        reason: e.reason,
      });
    }
  }
  return { map, unavail };
}

function sortModels(
  models: ModelEntry[],
  map: Map<string, RecInfo>,
  skipIds: Set<string>,
) {
  return [...models]
    .filter((m) => !skipIds.has(m.id))
    .sort((a, b) => {
      const ar = map.get(a.id);
      const br = map.get(b.id);
      if (ar?.isTop && !br?.isTop) return -1;
      if (!ar?.isTop && br?.isTop) return 1;
      if (ar && !br) return -1;
      if (!ar && br) return 1;
      if (ar && br) return br.matchPct - ar.matchPct;
      return 0;
    });
}

/* ───────────────────────────────────────────────────────
   Shared visual components
   ─────────────────────────────────────────────────────── */

/** Quality/speed 1-3 from model traits (thresholds based on per-second rates) */
function getRatings(m: ModelEntry) {
  return {
    quality: m.creditsPerSecond >= 10 ? 3 : m.creditsPerSecond >= 5 ? 2 : 1,
    speed: m.badge === "draft" ? 3 : m.creditsPerSecond >= 10 ? 1 : 2,
  };
}

/** Krea-style 3-pip indicator */
function Pips({ filled, color }: { filled: number; color: string }) {
  return (
    <div className="flex gap-[3px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: i < filled ? color : "#2A2D35" }}
        />
      ))}
    </div>
  );
}

/** Radio circle */
function Radio({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        "h-[18px] w-[18px] flex-none rounded-full border-2 transition-colors",
        "flex items-center justify-center",
        on
          ? "border-white bg-white"
          : "border-tool-text-disabled bg-transparent",
      )}
    >
      {on && (
        <div className="h-[7px] w-[7px] rounded-full bg-tool-surface-card" />
      )}
    </div>
  );
}

/** Card gradient placeholder (in lieu of preview thumbnails) */
const GRADIENTS: Record<string, string> = {
  "sora-2": "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)",
  "google/veo-3": "linear-gradient(135deg, #141E30 0%, #243B55 100%)",
  "kling-v2-1-master":
    "linear-gradient(135deg, #2C1810 0%, #5D3A1A 50%, #3E2712 100%)",
  "luma-ray3": "linear-gradient(135deg, #1A0530 0%, #3D1560 50%, #250940 100%)",
  "runway-gen45":
    "linear-gradient(135deg, #1F1013 0%, #4A1D28 50%, #2B1018 100%)",
  "wan-2.5": "linear-gradient(135deg, #0A1F0A 0%, #1A4A1A 50%, #0D2B0D 100%)",
  "wan-2.2": "linear-gradient(135deg, #0D1F15 0%, #1A3A28 50%, #0F2B1C 100%)",
};

/* ───────────────────────────────────────────────────────
   LIST VIEW — compact sidebar rows (Krea Image 2)
   ─────────────────────────────────────────────────────── */

function ListRow({
  model,
  selected,
  recInfo,
  onSelect,
}: {
  model: ModelEntry;
  selected: boolean;
  recInfo: RecInfo | undefined;
  onSelect: (id: string) => void;
}) {
  const meta = resolveModelMeta(model.id);
  const r = getRatings(model);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(model.id)}
      className="flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
    >
      <div className="pt-[3px]">
        <Radio on={selected} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[14px] leading-tight",
              selected ? "font-bold text-white" : "font-medium text-muted",
            )}
          >
            {model.label}
          </span>
          {recInfo?.isTop && (
            <Star className="h-3 w-3 text-amber-400" weight="fill" />
          )}
        </div>
        <span className="text-[12px] leading-relaxed text-tool-text-dim">
          {meta.strength}
        </span>
        <div className="flex items-center gap-3 pt-1">
          <Pips filled={r.quality} color="#CDD1DC" />
          <Pips filled={r.speed} color="#FBBF24" />
          <div className="flex-1" />
          <span className="tabular-nums text-[12px] text-tool-text-dim">
            ~{getVideoCost(model.id)}{" "}
            <span className="text-[10px] opacity-60">cr</span>
          </span>
        </div>
      </div>
    </button>
  );
}

/* ───────────────────────────────────────────────────────
   CARD VIEW — grid cards (Krea Image 1)
   ─────────────────────────────────────────────────────── */

function ModelCard({
  model,
  selected,
  recInfo,
  onSelect,
}: {
  model: ModelEntry;
  selected: boolean;
  recInfo: RecInfo | undefined;
  onSelect: (id: string) => void;
}) {
  const meta = resolveModelMeta(model.id);
  const r = getRatings(model);
  const gradient =
    GRADIENTS[model.id] ?? "linear-gradient(135deg, #1E2030, #2A2D3E)";

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(model.id)}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl text-left transition-shadow",
        selected
          ? "ring-2 ring-tool-accent-neutral ring-offset-2 ring-offset-tool-surface-card"
          : "ring-1 ring-tool-nav-active hover:ring-tool-text-disabled",
      )}
    >
      {/* Gradient header (thumbnail placeholder) */}
      <div className="relative h-36 w-full" style={{ background: gradient }}>
        {recInfo?.isTop && (
          <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/40">
            <Star className="h-3.5 w-3.5 text-amber-400" weight="fill" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 bg-tool-surface-card px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-2">
          <Radio on={selected} />
          <span
            className={cn(
              "text-[15px] leading-tight",
              selected ? "font-bold text-white" : "font-semibold text-muted",
            )}
          >
            {model.label}
          </span>
        </div>
        <span className="text-[12.5px] leading-relaxed text-tool-text-dim">
          {meta.strength}
        </span>
        <div className="flex items-center gap-3 pt-0.5">
          <Pips filled={r.quality} color="#CDD1DC" />
          <Pips filled={r.speed} color="#FBBF24" />
          <div className="flex-1" />
          <span className="tabular-nums text-[13px] text-tool-text-dim">
            ~{getVideoCost(model.id)}{" "}
            <span className="text-[11px] opacity-60">cr</span>
          </span>
        </div>
      </div>
    </button>
  );
}

/* ───────────────────────────────────────────────────────
   Main component — two-tier interaction
   ─────────────────────────────────────────────────────── */

export function ModelRecommendationDropdown({
  renderModelOptions,
  renderModelId,
  onModelChange,
  modelRecommendation,
  recommendedModelId,
  efficientModelId,
  filteredOut,
  triggerClassName,
  triggerPrefixLabel,
  triggerPrefixIcon,
  triggerAriaLabel,
}: ModelRecommendationDropdownProps): React.ReactElement {
  const [mode, setMode] = useState<ViewMode>("closed");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Position state for the list popover
  const [listStyle, setListStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  /* ── Data ── */

  const models = useMemo(
    () => buildModelEntries(renderModelOptions),
    [renderModelOptions],
  );

  const current = useMemo(
    () =>
      models.find((m) => m.id === renderModelId) ??
      models.find((m) => m.id === VIDEO_DRAFT_MODEL.id) ??
      models[0],
    [models, renderModelId],
  );

  const { map: recMap, unavail } = useMemo(
    () =>
      buildRecMap(
        models,
        modelRecommendation,
        recommendedModelId,
        efficientModelId,
        filteredOut ?? modelRecommendation?.filteredOut,
      ),
    [
      models,
      modelRecommendation,
      recommendedModelId,
      efficientModelId,
      filteredOut,
    ],
  );

  const unavailIds = useMemo(
    () => new Set(unavail.map((u) => u.id)),
    [unavail],
  );
  const sorted = useMemo(
    () => sortModels(models, recMap, unavailIds),
    [models, recMap, unavailIds],
  );
  const drafts = useMemo(
    () => sorted.filter((m) => m.badge === "draft"),
    [sorted],
  );
  const renders = useMemo(
    () => sorted.filter((m) => m.badge === "render"),
    [sorted],
  );

  /* ── Select handler ── */

  const handleSelect = useCallback(
    (id: string) => {
      onModelChange(id);
      if (mode === "cards") setMode("closed");
    },
    [onModelChange, mode],
  );

  /* ── List popover positioning ── */

  const positionList = useCallback(() => {
    const btn = buttonRef.current;
    const list = listRef.current;
    if (!btn || !list) return;

    const btnRect = btn.getBoundingClientRect();
    const listH = list.scrollHeight;
    const margin = 8;

    // Try to open upward, align left with the sidebar panel
    const panel = btn.closest("[data-panel]");
    const panelRect = panel?.getBoundingClientRect();
    const left = panelRect ? panelRect.left : btnRect.left;
    const width = panelRect ? panelRect.width : 380;

    let top = btnRect.top - listH - 6;
    if (top < margin) top = btnRect.bottom + 6; // fall below if no room

    setListStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: Math.min(listH, window.innerHeight - margin * 2),
      visibility: "visible",
    });
  }, []);

  useEffect(() => {
    if (mode !== "list") return;
    // Position once rendered, then track scroll/resize
    const raf = requestAnimationFrame(positionList);
    window.addEventListener("scroll", positionList, true);
    window.addEventListener("resize", positionList);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", positionList, true);
      window.removeEventListener("resize", positionList);
    };
  }, [mode, positionList]);

  /* ── Hover: show list ── */

  const onEnterTrigger = useCallback(() => {
    if (mode === "cards") return;
    clearTimeout(leaveTimer.current);
    hoverTimer.current = setTimeout(() => setMode("list"), 180);
  }, [mode]);

  const onLeaveTrigger = useCallback(() => {
    clearTimeout(hoverTimer.current);
    if (mode === "list") {
      leaveTimer.current = setTimeout(() => setMode("closed"), 280);
    }
  }, [mode]);

  const onEnterList = useCallback(() => {
    clearTimeout(leaveTimer.current);
  }, []);

  const onLeaveList = useCallback(() => {
    if (mode === "list") {
      leaveTimer.current = setTimeout(() => setMode("closed"), 280);
    }
  }, [mode]);

  /* ── Click: show cards ── */

  const onClickTrigger = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setMode((prev) => (prev === "cards" ? "closed" : "cards"));
  }, []);

  /* ── Escape to close ── */

  useEffect(() => {
    if (mode === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("closed");
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mode]);

  /* ── Cleanup ── */

  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
      clearTimeout(leaveTimer.current);
    },
    [],
  );

  /* ── Reset list style when closing ── */

  useEffect(() => {
    if (mode !== "list")
      setListStyle({ position: "fixed", visibility: "hidden" });
  }, [mode]);

  return (
    <>
      {/* ── Trigger button ── */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={onClickTrigger}
          onMouseEnter={onEnterTrigger}
          onMouseLeave={onLeaveTrigger}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg border border-tool-nav-active bg-tool-surface-card px-3 text-xs font-semibold text-foreground transition-[border-color,transform,background-color]",
            "duration-[160ms] [transition-timing-function:var(--motion-ease-standard)] hover:-translate-y-px hover:border-tool-text-disabled",
            mode !== "closed" && "border-tool-accent-neutral",
            triggerClassName,
          )}
          aria-haspopup="listbox"
          aria-expanded={mode !== "closed"}
          aria-label={triggerAriaLabel ?? "Video model"}
        >
          {triggerPrefixIcon ? (
            <span className="inline-flex items-center" aria-hidden="true">
              {triggerPrefixIcon}
            </span>
          ) : null}
          {triggerPrefixLabel && (
            <span className="text-[11px] font-medium text-tool-text-subdued">
              {triggerPrefixLabel}
            </span>
          )}
          {current?.label ?? "Model"}
          <CaretDown
            className={cn(
              "h-2.5 w-2.5 text-tool-text-dim transition-transform",
              mode !== "closed" && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════
         LIST VIEW — hover popover (Krea sidebar style)
         ═══════════════════════════════════════════════════ */}
      {mode === "list" &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label="Model selection"
            style={listStyle}
            className="motion-presence-panel z-dropdown overflow-y-auto overflow-x-hidden rounded-xl border border-tool-nav-active bg-tool-surface-card py-1 shadow-[0_16px_48px_rgba(0,0,0,0.6)] ps-animate-scale-in"
            data-motion-state="entered"
            onMouseEnter={onEnterList}
            onMouseLeave={onLeaveList}
          >
            {/* Header — click to open full card view */}
            <button
              type="button"
              onClick={() => setMode("cards")}
              className="flex w-full items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-tool-text-dim transition-colors hover:text-white"
            >
              Click to view all models
              <CaretDown className="h-3 w-3" />
            </button>

            <div className="mx-3.5 h-px bg-tool-nav-active" />

            {sorted.map((m) => (
              <ListRow
                key={m.id}
                model={m}
                selected={m.id === renderModelId}
                recInfo={recMap.get(m.id)}
                onSelect={handleSelect}
              />
            ))}

            {unavail.length > 0 && (
              <>
                <div className="mx-3.5 h-px bg-tool-nav-active" />
                {unavail.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 px-4 py-2 opacity-40"
                  >
                    <WarningCircle className="h-4 w-4 flex-none text-amber-400" />
                    <span className="text-[13px] text-tool-text-dim">
                      {e.label}
                    </span>
                    <div className="flex-1" />
                    <span className="text-[10px] italic text-tool-text-label">
                      {formatReasonLabel(e.reason)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════
         CARD VIEW — full overlay grid (Krea expanded style)
         ═══════════════════════════════════════════════════ */}
      {mode === "cards" &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="motion-presence-overlay fixed inset-0 z-modal-backdrop bg-black/60 backdrop-blur-sm ps-animate-fade-in"
              data-motion-state="entered"
              onClick={() => setMode("closed")}
            />

            {/* Scrollable card panel */}
            <div className="fixed inset-0 z-modal overflow-y-auto">
              <div className="flex min-h-full items-start justify-center px-6 py-16">
                <div
                  className="motion-presence-panel relative w-full max-w-[900px] rounded-2xl border border-tool-nav-active bg-tool-surface-card p-8 shadow-[0_24px_80px_rgba(0,0,0,0.7)] ps-animate-scale-in"
                  data-motion-state="entered"
                >
                  {/* Close */}
                  <button
                    type="button"
                    onClick={() => setMode("closed")}
                    className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-tool-text-dim transition-colors hover:bg-tool-nav-active hover:text-white"
                  >
                    <X className="h-5 w-5" weight="bold" />
                  </button>

                  {/* Render models */}
                  {renders.length > 0 && (
                    <section className="mb-10">
                      <h3 className="text-[18px] font-bold text-white">
                        Render Models
                      </h3>
                      <p className="mb-5 mt-1 text-[13px] text-tool-text-dim">
                        High-quality models for final production output.
                      </p>
                      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        {renders.map((m) => (
                          <ModelCard
                            key={m.id}
                            model={m}
                            selected={m.id === renderModelId}
                            recInfo={recMap.get(m.id)}
                            onSelect={handleSelect}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Draft models */}
                  {drafts.length > 0 && (
                    <section>
                      <h3 className="text-[18px] font-bold text-white">
                        Draft Models
                      </h3>
                      <p className="mb-5 mt-1 text-[13px] text-tool-text-dim">
                        Fast, affordable models for previewing and iterating.
                      </p>
                      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        {drafts.map((m) => (
                          <ModelCard
                            key={m.id}
                            model={m}
                            selected={m.id === renderModelId}
                            recInfo={recMap.get(m.id)}
                            onSelect={handleSelect}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Unavailable */}
                  {unavail.length > 0 && (
                    <section className="mt-10 border-t border-tool-nav-active pt-6">
                      <h3 className="mb-4 text-[14px] font-semibold text-tool-text-dim">
                        Unavailable
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {unavail.map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center gap-3 rounded-xl bg-tool-surface-card px-4 py-3 opacity-50"
                          >
                            <WarningCircle className="h-5 w-5 flex-none text-amber-400" />
                            <div>
                              <div className="text-[14px] font-medium text-tool-text-dim">
                                {e.label}
                              </div>
                              <div className="text-[11px] italic text-tool-text-label">
                                {formatReasonLabel(e.reason)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
