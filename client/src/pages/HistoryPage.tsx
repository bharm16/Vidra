import React from "react";
import { Link } from "react-router-dom";
import { Badge, Search, X } from "@promptstudio/system/components/ui";
import { useAuthUser } from "@hooks/useAuthUser";
import { usePromptHistory } from "@hooks/usePromptHistory";
import type { PromptHistoryEntry } from "@features/prompt-optimizer";
import { Button } from "@promptstudio/system/components/ui/button";
import { Input } from "@promptstudio/system/components/ui/input";
import { AUTH_COLORS } from "./auth/auth-styles";

function formatRelativeOrDate(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  const ms = t.getTime();
  if (Number.isNaN(ms)) return "—";
  const diffMs = Date.now() - ms;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 0) return t.toLocaleDateString();
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 14) return `${diffDays}d ago`;
  return t.toLocaleDateString();
}

function deriveTitle(entry: PromptHistoryEntry): string {
  const storedTitle = typeof entry.title === "string" ? entry.title.trim() : "";
  if (storedTitle) return storedTitle;
  const source = (entry.output || "").trim().replace(/\s+/g, " ");
  if (!source) return "Untitled prompt";
  return source.length > 96 ? `${source.slice(0, 96).trim()}…` : source;
}

function deriveSnippet(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "—";
  return normalized;
}

/** Tag pill reused across history entries */
function Tag({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: AUTH_COLORS.inputBg,
        border: `1px solid ${AUTH_COLORS.inputBorder}`,
        color: AUTH_COLORS.textDim,
      }}
    >
      {children}
    </span>
  );
}

export function HistoryPage(): React.ReactElement {
  const user = useAuthUser();

  const promptHistory = usePromptHistory(user);
  const filteredOutputs = React.useMemo(() => {
    const q = promptHistory.searchQuery.trim().toLowerCase();
    if (!q) return promptHistory.history;
    return promptHistory.history.filter((entry) =>
      entry.output.toLowerCase().includes(q),
    );
  }, [promptHistory.history, promptHistory.searchQuery]);

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: AUTH_COLORS.bg }}
    >
      {/* Toolbar — compact, functional */}
      <div
        className="sticky top-0 z-10 px-4 py-3 sm:px-6"
        style={{
          background: AUTH_COLORS.bg,
          borderBottom: `1px solid ${AUTH_COLORS.divider}`,
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-[15px] font-semibold tracking-tight text-white">
              History
            </h1>
            <div className="flex items-center gap-3">
              <span
                className="text-[12px] tabular-nums"
                style={{ color: AUTH_COLORS.textDim }}
              >
                {filteredOutputs.length}
                {promptHistory.searchQuery ? " results" : " prompts"}
              </span>
              {user ? (
                <Badge variant="success" size="sm">
                  Synced
                </Badge>
              ) : (
                <Button
                  asChild
                  variant="ghost"
                  className="h-auto rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: AUTH_COLORS.card,
                    border: `1px solid ${AUTH_COLORS.cardBorder}`,
                    color: AUTH_COLORS.textDim,
                  }}
                >
                  <Link to="/signin?redirect=/history">Sign in to sync</Link>
                </Button>
              )}
              <Link
                to="/"
                className="text-[12px] font-medium transition-colors hover:text-white"
                style={{ color: AUTH_COLORS.textDim }}
              >
                Back to app
              </Link>
            </div>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: AUTH_COLORS.textPlaceholder }}
              aria-hidden="true"
            />
            <Input
              className="w-full rounded-lg py-2 pl-10 pr-10 text-[13px] text-white outline-none transition"
              style={{
                background: AUTH_COLORS.inputBg,
                border: `1px solid ${AUTH_COLORS.inputBorder}`,
                color: AUTH_COLORS.text,
              }}
              type="search"
              value={promptHistory.searchQuery}
              onChange={(e) => promptHistory.setSearchQuery(e.target.value)}
              placeholder="Search prompts…"
              aria-label="Search prompt history"
            />
            {promptHistory.searchQuery ? (
              <Button
                type="button"
                onClick={() => promptHistory.setSearchQuery("")}
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md p-0 transition-colors"
                aria-label="Clear search"
                title="Clear"
              >
                <X
                  className="h-3.5 w-3.5"
                  style={{ color: AUTH_COLORS.textDim }}
                  aria-hidden="true"
                />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {promptHistory.isLoadingHistory ? (
          <div className="py-12 text-center">
            <div className="ps-spinner-sm mx-auto mb-3" />
            <p
              className="text-[13px]"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              Loading history…
            </p>
          </div>
        ) : filteredOutputs.length === 0 ? (
          <div className="py-16 text-center">
            <p
              className="text-[13px]"
              style={{ color: AUTH_COLORS.textSecondary }}
            >
              {promptHistory.searchQuery
                ? `No results for "${promptHistory.searchQuery}".`
                : "No prompts saved yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 pt-4">
            {filteredOutputs.map((entry, index) => {
              const title = deriveTitle(entry);
              const uuid = typeof entry.uuid === "string" ? entry.uuid : null;
              const sessionId = typeof entry.id === "string" ? entry.id : null;
              const when = formatRelativeOrDate(entry.timestamp);
              const mode =
                typeof entry.mode === "string" && entry.mode.trim()
                  ? entry.mode.trim()
                  : null;
              const model =
                typeof entry.targetModel === "string" &&
                entry.targetModel.trim()
                  ? entry.targetModel.trim()
                  : null;

              return (
                <article
                  key={
                    entry.id ??
                    entry.uuid ??
                    `${entry.timestamp ?? "no-ts"}-${index}`
                  }
                  className="rounded-[10px] p-4"
                  style={{
                    background: AUTH_COLORS.card,
                    border: `1px solid ${AUTH_COLORS.cardBorder}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2
                        className="truncate text-[13px] font-semibold text-white"
                        title={title}
                      >
                        {title}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className="text-[11px] tabular-nums"
                          style={{ color: AUTH_COLORS.textDim }}
                        >
                          {when}
                        </span>
                        {mode ? <Tag>{mode}</Tag> : null}
                        {model ? <Tag>{model}</Tag> : null}
                        {typeof entry.score === "number" ? (
                          <Tag>Score {Math.round(entry.score)}</Tag>
                        ) : null}
                      </div>
                    </div>

                    {sessionId ? (
                      <Link
                        to={`/session/${sessionId}`}
                        className="shrink-0 text-[12px] font-semibold transition-colors hover:text-white"
                        style={{ color: AUTH_COLORS.accent }}
                        aria-label="Open prompt"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>

                  <div
                    className="mt-3 rounded-lg p-3"
                    style={{
                      background: AUTH_COLORS.inputBg,
                      border: `1px solid ${AUTH_COLORS.inputBorder}`,
                    }}
                  >
                    <span
                      className="text-overline"
                      style={{ color: AUTH_COLORS.textLabel }}
                    >
                      Output
                    </span>
                    <p
                      className="ps-line-clamp-3 mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-snug"
                      style={{ color: AUTH_COLORS.textSecondary }}
                    >
                      {deriveSnippet(entry.output)}
                    </p>
                  </div>

                  {uuid ? (
                    <p
                      className="mt-2.5 font-mono text-[11px]"
                      style={{ color: AUTH_COLORS.textLabel }}
                    >
                      {uuid}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
