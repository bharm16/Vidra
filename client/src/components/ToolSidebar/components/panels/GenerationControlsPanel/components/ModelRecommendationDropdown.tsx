import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Badge,
  CaretDown,
  WarningCircle,
  X,
} from "@promptstudio/system/components/ui";
import {
  VIDEO_DRAFT_MODEL,
  VIDEO_RENDER_MODELS,
} from "@components/ToolSidebar/config/modelConfig";
import { cn } from "@/utils/cn";
import { resolveModelMeta, resolveModelStill } from "@/config/videoModels";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import type { ModelRecommendation } from "@/features/model-intelligence/types";
import { normalizeModelIdForSelection } from "@/features/model-intelligence/utils/modelLabels";

/* ───────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────── */

interface ModelEntry {
  id: string;
  label: string;
  badge: "draft" | "render";
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

/* Generation economics never speak in the showroom (ADR-0008), so the
   insufficient-credits reason collapses into the generic label. */
const REASON_LABELS: Record<string, string> = {
  insufficient_credits: "Unavailable",
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
  /** Icon-only trigger (the composer's collapsed-toolbar treatment): hides
   *  the model label + caret; the aria-label carries the accessible name. */
  triggerLabelHidden?: boolean | undefined;
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
    id: m.id,
    label: labels.get(m.id) ?? m.label,
    badge: "render" as const,
  }));
  return [
    {
      id: VIDEO_DRAFT_MODEL.id,
      label: VIDEO_DRAFT_MODEL.label,
      badge: "draft" as const,
    },
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

/** Radio circle — monochrome selection treatment: strong ring + filled dot. */
function Radio({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        "flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border transition-colors",
        on ? "border-foreground" : "border-tool-text-disabled",
      )}
    >
      {on && <div className="bg-foreground h-2 w-2 rounded-full" />}
    </div>
  );
}

/* ───────────────────────────────────────────────────────
   LIST VIEW — compact sidebar rows
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
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(model.id)}
      className="hover:bg-tool-nav-hover flex w-full gap-3 px-4 py-3.5 text-left transition-colors"
    >
      <div className="pt-[3px]">
        <Radio on={selected} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[14px] leading-tight",
              selected
                ? "text-foreground font-semibold"
                : "text-muted font-medium",
            )}
          >
            {model.label}
          </span>
          {recInfo?.isTop && (
            <Badge variant="subtle" size="xs">
              Recommended
            </Badge>
          )}
        </div>
        <span className="text-tool-text-dim text-[12px] leading-relaxed">
          {meta.strength}
        </span>
      </div>
    </button>
  );
}

/* ───────────────────────────────────────────────────────
   CARD VIEW — showroom gallery cards
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
  const still = resolveModelStill(model.id);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(model.id)}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border text-left transition-colors",
        selected
          ? "border-border-strong"
          : "border-border hover:border-border-strong",
      )}
    >
      {/* Sample-still slot — per-model still as an absolute <img> cover;
          the flat "pending" slate remains the fallback for unmapped ids. */}
      <div className="border-border bg-surface-2 relative h-36 w-full border-b">
        {still ? (
          <img
            src={still}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="border-border text-overline text-faint rounded-sm border px-3 py-1.5">
              {model.label}
            </span>
          </div>
        )}
        {recInfo?.isTop && (
          <Badge variant="subtle" size="xs" className="absolute left-3 top-3">
            Recommended
          </Badge>
        )}
      </div>

      {/* Info — the strength copy leads; the radio row carries selection. */}
      <div className="bg-tool-surface-card flex flex-col gap-2 px-4 pb-4 pt-3.5">
        <span className="text-foreground text-[13px] leading-relaxed">
          {meta.strength}
        </span>
        <div className="flex items-center gap-2">
          <Radio on={selected} />
          <span
            className={cn(
              "text-[12px] leading-tight",
              selected
                ? "text-foreground font-semibold"
                : "text-muted font-medium",
            )}
          >
            {model.label}
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
  triggerLabelHidden = false,
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

  /* ── Escape to close the list popover (the showroom dialog handles
        its own Escape via the system Dialog) ── */

  useEffect(() => {
    if (mode !== "list") return;
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
            "border-tool-nav-active bg-tool-surface-card text-foreground flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-[border-color,transform,background-color]",
            "hover:border-tool-text-disabled duration-[160ms] [transition-timing-function:var(--motion-ease-standard)] hover:-translate-y-px",
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
            <span className="text-tool-text-subdued text-[11px] font-medium">
              {triggerPrefixLabel}
            </span>
          )}
          {triggerLabelHidden ? null : (
            <>
              {current?.label ?? "Model"}
              <CaretDown
                className={cn(
                  "text-tool-text-dim h-2.5 w-2.5 transition-transform",
                  mode !== "closed" && "rotate-180",
                )}
              />
            </>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════
         LIST VIEW — hover popover
         ═══════════════════════════════════════════════════ */}
      {mode === "list" &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label="Model selection"
            style={listStyle}
            className="motion-presence-panel z-dropdown border-border bg-tool-surface-card shadow-floating ps-animate-scale-in overflow-y-auto overflow-x-hidden rounded-xl border py-1"
            data-motion-state="entered"
            onMouseEnter={onEnterList}
            onMouseLeave={onLeaveList}
          >
            {/* Header — click to open full card view */}
            <button
              type="button"
              onClick={() => setMode("cards")}
              className="text-tool-text-dim hover:text-foreground flex w-full items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors"
            >
              Click to view all models
              <CaretDown className="h-3 w-3" />
            </button>

            <div className="bg-border mx-3.5 h-px" />

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
                <div className="bg-border mx-3.5 h-px" />
                {unavail.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 px-4 py-2 opacity-40"
                  >
                    <WarningCircle className="text-faint h-4 w-4 flex-none" />
                    <span className="text-tool-text-dim text-[13px]">
                      {e.label}
                    </span>
                    <div className="flex-1" />
                    <span className="text-tool-text-label text-[10px] italic">
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
         CARD VIEW — the model showroom (system Dialog)
         ═══════════════════════════════════════════════════ */}
      <FullscreenDialog
        open={mode === "cards"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setMode("closed");
        }}
        title="Choose a model"
        description="Browse render and draft models and pick one."
        contentClassName="overflow-y-auto"
      >
        <div
          className="flex min-h-full w-full items-start justify-center px-6 py-16"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMode("closed");
          }}
        >
          <div className="border-border bg-tool-surface-card shadow-floating relative w-full max-w-4xl rounded-2xl border p-8">
            {/* Close */}
            <button
              type="button"
              onClick={() => setMode("closed")}
              aria-label="Close model showroom"
              className="text-tool-text-dim hover:bg-tool-nav-active hover:text-foreground absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            >
              <X className="h-5 w-5" weight="bold" />
            </button>

            {/* Render models */}
            {renders.length > 0 && (
              <section className="mb-10">
                <h3 className="text-overline text-tool-text-subdued">
                  Render models
                </h3>
                <p className="text-tool-text-dim mb-5 mt-1 text-[13px]">
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
                <h3 className="text-overline text-tool-text-subdued">
                  Draft models
                </h3>
                <p className="text-tool-text-dim mb-5 mt-1 text-[13px]">
                  Fast models for previewing and iterating.
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
              <section className="border-border mt-10 border-t pt-6">
                <h3 className="text-overline text-tool-text-subdued mb-4">
                  Unavailable
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {unavail.map((e) => (
                    <div
                      key={e.id}
                      className="border-border bg-surface-2 flex items-center gap-3 rounded-xl border px-4 py-3 opacity-50"
                    >
                      <WarningCircle className="text-faint h-5 w-5 flex-none" />
                      <div>
                        <div className="text-tool-text-dim text-[14px] font-medium">
                          {e.label}
                        </div>
                        <div className="text-tool-text-label text-[11px] italic">
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
      </FullscreenDialog>
    </>
  );
}
