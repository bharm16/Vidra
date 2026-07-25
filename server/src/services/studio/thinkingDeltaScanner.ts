/**
 * Incremental extraction of the `thinking` string from a STREAMING JSON
 * decision. The LLM emits the decision as one JSON object with `thinking`
 * as its first field (template rule 10); this scanner surfaces those
 * characters the moment they arrive — long before the JSON completes — so
 * the route can forward real token deltas to the client.
 *
 * Pure character state machine (no regex — house rule). Chunks may split
 * anywhere: mid-key, mid-escape, mid-\uXXXX. The key must sit in object-key
 * position (preceded by `{` or `,`), which distinguishes it from the word
 * "thinking" inside another string value — where any interior quotes are
 * necessarily escaped (\") in valid JSON, so the raw byte run `"thinking"`
 * cannot occur there. Nested objects carrying their own `thinking` key are
 * outside the decision contract.
 */

const KEY = '"thinking"';

type ScannerState =
  | "seek" // hunting for the key
  | "postkey" // key matched; expect optional whitespace then ':'
  | "prequote" // colon seen; expect optional whitespace then '"'
  | "value" // inside the thinking string — emitting
  | "escape" // previous value char was '\'
  | "unicode" // collecting 4 hex chars of \uXXXX
  | "done"; // closing quote seen; ignore the rest

const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

function isJsonWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

export class ThinkingDeltaScanner {
  private state: ScannerState = "seek";
  private keyIndex = 0;
  /** Last non-whitespace char seen before the current key candidate. */
  private prevSignificant = "";
  private candidateContext = "";
  private unicodeBuffer = "";

  /** Feed the next raw chunk; returns the thinking characters it revealed. */
  push(chunk: string): string {
    let out = "";
    for (const ch of chunk) {
      switch (this.state) {
        case "seek": {
          if (ch === KEY[this.keyIndex]) {
            if (this.keyIndex === 0)
              this.candidateContext = this.prevSignificant;
            this.keyIndex += 1;
            if (this.keyIndex === KEY.length) {
              const inKeyPosition =
                this.candidateContext === "{" || this.candidateContext === ",";
              this.state = inKeyPosition ? "postkey" : "seek";
              this.keyIndex = 0;
              // The candidate's closing quote is the char behind us now.
              this.prevSignificant = '"';
            }
          } else {
            // A failed candidate may still END on the char that starts a
            // new one (`"` is both KEY's first and last char).
            this.keyIndex = ch === KEY[0] ? 1 : 0;
            if (this.keyIndex === 1)
              this.candidateContext = this.prevSignificant;
            if (!isJsonWhitespace(ch)) this.prevSignificant = ch;
          }
          break;
        }
        case "postkey": {
          if (isJsonWhitespace(ch)) break;
          this.state = ch === ":" ? "prequote" : "seek";
          if (this.state === "seek") this.prevSignificant = ch;
          break;
        }
        case "prequote": {
          if (isJsonWhitespace(ch)) break;
          // The schema guarantees a string; anything else — resume seeking.
          this.state = ch === '"' ? "value" : "seek";
          if (this.state === "seek") this.prevSignificant = ch;
          break;
        }
        case "value": {
          if (ch === "\\") {
            this.state = "escape";
          } else if (ch === '"') {
            this.state = "done";
          } else {
            out += ch;
          }
          break;
        }
        case "escape": {
          if (ch === "u") {
            this.unicodeBuffer = "";
            this.state = "unicode";
          } else {
            out += ESCAPES[ch] ?? ch;
            this.state = "value";
          }
          break;
        }
        case "unicode": {
          this.unicodeBuffer += ch;
          if (this.unicodeBuffer.length === 4) {
            const code = Number.parseInt(this.unicodeBuffer, 16);
            if (Number.isFinite(code)) out += String.fromCharCode(code);
            this.state = "value";
          }
          break;
        }
        case "done":
          return out + this.drainRemainder();
      }
    }
    return out;
  }

  /** Once done, later chunks are ignored entirely. */
  private drainRemainder(): string {
    return "";
  }
}
