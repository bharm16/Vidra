/**
 * How other modules find a rendered highlight.
 *
 * `span-highlighting` builds the highlight element — it sets the class via
 * `getHighlightClassName` and the dataset keys via `DATASET_KEYS`. But the
 * modules that *read* those elements live in `prompt-optimizer`, and they were
 * each hand-writing the class and the attribute as bare literals: six query
 * sites, three different escaping disciplines for the same selector, and one
 * with none at all. `DATASET_KEYS` existed the whole time and had exactly one
 * consumer — the writer.
 *
 * So the feature that owns the element publishes the read side of its own
 * protocol. One name, one escaping rule, one place to change either.
 */

/** The class every highlight carries, whatever its category. */
export const HIGHLIGHT_CLASS = "value-word";

/** Every highlight under a root. */
export const HIGHLIGHT_SELECTOR = `.${HIGHLIGHT_CLASS}`;

/**
 * The attribute form of `DATASET_KEYS.SPAN_ID`.
 *
 * `dataset.spanId` (what the writer assigns) and `[data-span-id]` (what a
 * query matches) are one fact in the DOM's two spellings. Declared rather
 * than derived — the camel-to-dash conversion reads worse than it protects —
 * so `spanSelectors.test.ts` is what keeps the pair honest.
 */
export const SPAN_ID_ATTR = "data-span-id";

/**
 * Escape a value for use inside an attribute selector.
 *
 * Span ids arrive from the server DTO, so they are not guaranteed to be
 * CSS-safe: an unescaped quote turns `querySelector` into a `SyntaxError`
 * rather than a miss. `CSS.escape` where available, a literal-quote fallback
 * otherwise.
 */
function escapeSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.split("\\").join("\\\\").split('"').join('\\"');
}

/** One highlight, by the span it renders. */
export function spanIdSelector(spanId: string): string {
  return `[${SPAN_ID_ATTR}="${escapeSelectorValue(spanId)}"]`;
}

/** Every highlight that carries a span id — the labelled ones. */
export const LABELLED_HIGHLIGHT_SELECTOR = `span${HIGHLIGHT_SELECTOR}[${SPAN_ID_ATTR}]`;
