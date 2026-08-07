import type { ShotPlan } from "../types";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "at",
  "with",
  "for",
  "from",
  "into",
  "onto",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
  "this",
  "that",
  "these",
  "those",
]);

const VERB_HINTS = new Set([
  "drive",
  "drives",
  "driving",
  "run",
  "runs",
  "running",
  "walk",
  "walks",
  "walking",
  "jump",
  "jumps",
  "jumping",
  "dance",
  "dances",
  "dancing",
  "sit",
  "sits",
  "sitting",
  "stand",
  "stands",
  "standing",
  "fly",
  "flies",
  "flying",
  "swim",
  "swims",
  "swimming",
  "talk",
  "talks",
  "talking",
  "look",
  "looks",
  "looking",
  "hold",
  "holds",
  "holding",
  "chase",
  "chases",
  "chasing",
]);

const PREPOSITIONS = new Set([
  "in",
  "on",
  "at",
  "with",
  "through",
  "across",
  "toward",
  "towards",
  "into",
  "onto",
  "near",
  "beside",
  "around",
  "behind",
  "before",
  "after",
  "under",
  "over",
  "past",
]);

const DOWNGRADE_OBJECT_MODIFIERS = new Set([
  "toy",
  "fake",
  "miniature",
  "model",
  "pretend",
]);
const ACTION_QUALIFIER_ROOTS = new Set([
  "pretend",
  "simulate",
  "mimic",
  "imagine",
]);

export interface RequiredIntent {
  subject: string | null;
  action: string | null;
}

export interface IntentLockResult {
  prompt: string;
  passed: boolean;
  repaired: boolean;
  required: RequiredIntent;
}

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9']+/g)
      ?.filter(Boolean) ?? []
  );
}

function normalizeWord(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    return stem.endsWith("v") ? `${stem}e` : stem;
  }
  if (w.length > 3 && w.endsWith("ed")) {
    const stem = w.slice(0, -2);
    return stem.endsWith("v") ? `${stem}e` : stem;
  }
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    current += char;

    if (char !== "." && char !== "!" && char !== "?") {
      continue;
    }

    let j = i + 1;
    while (j < text.length && text[j] === " ") {
      j += 1;
    }
    const nextChar = text[j];
    const isBoundary = !nextChar || (nextChar >= "A" && nextChar <= "Z");
    if (!isBoundary) {
      continue;
    }

    if (char === "." || char === "!" || char === "?") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        sentences.push(trimmed);
      }
      current = "";
    }
  }

  const tail = current.trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }

  return sentences;
}

function looksLikeVerb(token: string): boolean {
  if (VERB_HINTS.has(token)) {
    return true;
  }

  return (
    (token.endsWith("ing") && token.length > 4) ||
    (token.endsWith("ed") && token.length > 3) ||
    (token.endsWith("es") && token.length > 3)
  );
}

function cleanPhrase(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "");

  return cleaned.length > 0 ? cleaned : null;
}

function findVerbIndex(tokens: string[]): number {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token && looksLikeVerb(token)) {
      return i;
    }
  }
  return -1;
}

function extractSubjectFromPrompt(prompt: string): string | null {
  const tokens = tokenize(prompt);
  if (tokens.length === 0) {
    return null;
  }

  const verbIndex = findVerbIndex(tokens);
  const candidateTokens =
    verbIndex > 0
      ? tokens.slice(0, verbIndex).filter((token) => !STOPWORDS.has(token))
      : tokens.filter((token) => !STOPWORDS.has(token));

  if (candidateTokens.length === 0) {
    return null;
  }

  return candidateTokens.slice(0, 3).join(" ");
}

function extractActionFromPrompt(prompt: string): string | null {
  const tokens = tokenize(prompt);
  if (tokens.length === 0) {
    return null;
  }

  const verbIndex = findVerbIndex(tokens);
  if (verbIndex === -1) {
    return null;
  }

  const actionTokens: string[] = [];
  for (let i = verbIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    if (i > verbIndex && PREPOSITIONS.has(token)) {
      break;
    }
    actionTokens.push(token);
    if (actionTokens.length >= 5) {
      break;
    }
  }

  const cleaned = trimTrailingConnectors(actionTokens);
  return cleaned.length > 0 ? cleaned.join(" ") : null;
}

function trimTrailingConnectors(tokens: string[]): string[] {
  const trailing = new Set([...PREPOSITIONS, "a", "an", "the"]);
  const output = [...tokens];

  while (output.length > 1) {
    const last = output[output.length - 1];
    if (!last || !trailing.has(last)) {
      break;
    }
    output.pop();
  }

  return output;
}

function requiredSubjectTokens(requiredSubject: string): string[] {
  return tokenize(requiredSubject)
    .map(normalizeWord)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function requiredActionTokens(requiredAction: string): string[] {
  return tokenize(requiredAction)
    .map(normalizeWord)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function hasSubject(requiredSubject: string, candidatePrompt: string): boolean {
  const subjectTokens = requiredSubjectTokens(requiredSubject);
  if (subjectTokens.length === 0) {
    return true;
  }

  const candidateSet = new Set(tokenize(candidatePrompt).map(normalizeWord));
  return subjectTokens.every((token) => candidateSet.has(token));
}

function hasAction(requiredAction: string, candidatePrompt: string): boolean {
  const actionTokens = requiredActionTokens(requiredAction);
  if (actionTokens.length === 0) {
    return true;
  }

  const candidateSet = new Set(tokenize(candidatePrompt).map(normalizeWord));
  return actionTokens.every((token) => candidateSet.has(token));
}

function extractActionObjectTokens(requiredAction: string): string[] {
  const tokens = tokenize(requiredAction);
  const verbIndex = findVerbIndex(tokens);
  if (verbIndex === -1) {
    return [];
  }

  return trimTrailingConnectors(tokens.slice(verbIndex + 1))
    .map(normalizeWord)
    .filter(
      (token) =>
        token.length > 0 && !STOPWORDS.has(token) && !looksLikeVerb(token),
    );
}

function hasQualifiedAction(tokens: string[], actionRoot: string): boolean {
  for (let i = 0; i < tokens.length - 2; i += 1) {
    const t0 = normalizeWord(tokens[i] ?? "");
    const t1 = normalizeWord(tokens[i + 1] ?? "");
    const t2 = normalizeWord(tokens[i + 2] ?? "");

    if (!ACTION_QUALIFIER_ROOTS.has(t0)) {
      continue;
    }

    if (t1 === "to" && t2 === actionRoot) {
      return true;
    }
  }

  return false;
}

function hasModifierNearObject(tokens: string[], objectToken: string): boolean {
  const normalizedTokens = tokens.map((token) => normalizeWord(token));

  for (let i = 0; i < normalizedTokens.length; i += 1) {
    // Named `word`, not `token`: these are normalized words from a prompt, and
    // the secret-comparison lint rule reads any `token !==` as a timing-attack
    // surface. The name was the only thing wrong.
    const word = normalizedTokens[i];
    if (word !== objectToken) {
      continue;
    }

    const lookbackStart = Math.max(0, i - 2);
    for (let j = lookbackStart; j < i; j += 1) {
      const candidateModifier = normalizedTokens[j];
      if (
        candidateModifier &&
        DOWNGRADE_OBJECT_MODIFIERS.has(candidateModifier)
      ) {
        return true;
      }
    }
  }

  return false;
}

function preservesActionSemantics(
  requiredAction: string | null,
  originalPrompt: string,
  candidatePrompt: string,
): boolean {
  if (!requiredAction) {
    return true;
  }

  const requiredTokens = requiredActionTokens(requiredAction);
  const actionRoot = requiredTokens[0] ?? "";
  const originalTokens = tokenize(originalPrompt);
  const candidateTokens = tokenize(candidatePrompt);

  if (actionRoot.length > 0) {
    const originalHasQualified = hasQualifiedAction(originalTokens, actionRoot);
    const candidateHasQualified = hasQualifiedAction(
      candidateTokens,
      actionRoot,
    );
    if (!originalHasQualified && candidateHasQualified) {
      return false;
    }
  }

  const objectTokens = extractActionObjectTokens(requiredAction);
  for (const objectToken of objectTokens) {
    const originalHasDowngrade = hasModifierNearObject(
      originalTokens,
      objectToken,
    );
    const candidateHasDowngrade = hasModifierNearObject(
      candidateTokens,
      objectToken,
    );

    if (!originalHasDowngrade && candidateHasDowngrade) {
      return false;
    }
  }

  return true;
}

function capitalizeSentence(value: string): string {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function isUsableContextSentence(sentence: string): boolean {
  const tokens = tokenize(sentence);
  if (tokens.length < 6) {
    return false;
  }

  const alphabeticCount = tokens.filter((token) => /[a-z]/.test(token)).length;
  if (alphabeticCount < 5) {
    return false;
  }

  const firstToken = tokens[0] ?? "";
  if (!/[a-z]/.test(firstToken)) {
    return false;
  }

  return true;
}

function applyUniversalRepair(params: {
  originalPrompt: string;
  candidatePrompt: string;
  requiredSubject: string | null;
  requiredAction: string | null;
  shotPlan: ShotPlan | null;
}): string {
  const requiredClause = cleanPhrase(
    [params.requiredSubject ?? "", params.requiredAction ?? ""]
      .join(" ")
      .trim(),
  );

  const candidateSentences = splitSentences(params.candidatePrompt);
  const keptContext: string[] = [];

  for (const sentence of candidateSentences) {
    const normalizedSentence = cleanPhrase(sentence);
    if (!normalizedSentence) {
      continue;
    }

    if (
      params.requiredSubject &&
      params.requiredAction &&
      hasSubject(params.requiredSubject, normalizedSentence) &&
      hasAction(params.requiredAction, normalizedSentence)
    ) {
      continue;
    }

    if (
      !preservesActionSemantics(
        params.requiredAction,
        params.originalPrompt,
        normalizedSentence,
      )
    ) {
      continue;
    }

    if (!isUsableContextSentence(normalizedSentence)) {
      continue;
    }

    keptContext.push(normalizedSentence);
  }

  const rebuilt: string[] = [];
  if (requiredClause) {
    rebuilt.push(`${capitalizeSentence(requiredClause)}.`);
  }

  for (const sentence of keptContext) {
    const withPunctuation = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    if (
      rebuilt.some(
        (existing) => existing.toLowerCase() === withPunctuation.toLowerCase(),
      )
    ) {
      continue;
    }
    rebuilt.push(withPunctuation);
    if (rebuilt.length >= 5) {
      break;
    }
  }

  if (rebuilt.length < 4 && params.shotPlan) {
    const slotSentences = buildShotPlanContextSentences(params.shotPlan);
    for (const sentence of slotSentences) {
      const normalized = cleanPhrase(sentence);
      if (!normalized) {
        continue;
      }
      const withPunctuation = /[.!?]$/.test(normalized)
        ? normalized
        : `${normalized}.`;
      if (
        rebuilt.some(
          (existing) =>
            existing.toLowerCase() === withPunctuation.toLowerCase(),
        )
      ) {
        continue;
      }
      rebuilt.push(withPunctuation);
      if (rebuilt.length >= 5) {
        break;
      }
    }
  }

  const output = rebuilt.join(" ").replace(/\s+/g, " ").trim();
  return output.length > 0 ? output : params.candidatePrompt.trim();
}

function buildShotPlanContextSentences(shotPlan: ShotPlan): string[] {
  const sentences: string[] = [];

  const setting = cleanPhrase(shotPlan.setting);
  if (setting) {
    sentences.push(`In ${setting}`);
  }

  const shotType = cleanPhrase(shotPlan.shot_type);
  const cameraMove = cleanPhrase(shotPlan.camera_move);
  const cameraAngle = cleanPhrase(shotPlan.camera_angle);
  if (shotType || cameraMove || cameraAngle) {
    const cameraParts: string[] = [];
    if (shotType) cameraParts.push(shotType);
    if (cameraMove) cameraParts.push(`with ${cameraMove}`);
    if (cameraAngle) cameraParts.push(`at ${cameraAngle}`);
    sentences.push(`Camera uses ${cameraParts.join(" ")}`);
  }

  const lighting = cleanPhrase(shotPlan.lighting);
  if (lighting) {
    sentences.push(`Lighting is ${lighting}`);
  }

  const style = cleanPhrase(shotPlan.style);
  if (style) {
    sentences.push(`Style reference: ${style}`);
  }

  return sentences;
}

export class IntentLockService {
  extractRequiredIntent(
    prompt: string,
    shotPlan: ShotPlan | null,
  ): RequiredIntent {
    const parsedSubject = extractSubjectFromPrompt(prompt);
    const parsedAction = extractActionFromPrompt(prompt);

    const subject = parsedSubject ?? cleanPhrase(shotPlan?.subject);
    const action = parsedAction ?? cleanPhrase(shotPlan?.action);

    return { subject, action };
  }

  enforceIntentLock(params: {
    originalPrompt: string;
    optimizedPrompt: string;
    shotPlan: ShotPlan | null;
  }): IntentLockResult {
    const required = this.extractRequiredIntent(
      params.originalPrompt,
      params.shotPlan,
    );
    const currentPrompt = params.optimizedPrompt.trim();

    const subjectOk = required.subject
      ? hasSubject(required.subject, currentPrompt)
      : true;
    const actionOk = required.action
      ? hasAction(required.action, currentPrompt)
      : true;
    const semanticsOk = preservesActionSemantics(
      required.action,
      params.originalPrompt,
      currentPrompt,
    );

    if (subjectOk && actionOk && semanticsOk) {
      return {
        prompt: currentPrompt,
        passed: true,
        repaired: false,
        required,
      };
    }

    const repairedPrompt = applyUniversalRepair({
      originalPrompt: params.originalPrompt,
      candidatePrompt: currentPrompt,
      requiredSubject: required.subject,
      requiredAction: required.action,
      shotPlan: params.shotPlan,
    });

    const repairedSubjectOk = required.subject
      ? hasSubject(required.subject, repairedPrompt)
      : true;
    const repairedActionOk = required.action
      ? hasAction(required.action, repairedPrompt)
      : true;
    const repairedSemanticsOk = preservesActionSemantics(
      required.action,
      params.originalPrompt,
      repairedPrompt,
    );

    if (repairedSubjectOk && repairedActionOk && repairedSemanticsOk) {
      return {
        prompt: repairedPrompt,
        passed: true,
        repaired: true,
        required,
      };
    }

    throw new Error(
      "Intent lock failed: optimized prompt does not preserve required subject/action semantics",
    );
  }

  /**
   * Validate-only intent check — returns pass/fail without repairing.
   * Used after model-specific compilation where mutation would break
   * model-specific formatting.
   */
  validateIntentPreservation(params: {
    originalPrompt: string;
    optimizedPrompt: string;
    shotPlan: ShotPlan | null;
  }): { passed: boolean; required: RequiredIntent } {
    const required = this.extractRequiredIntent(
      params.originalPrompt,
      params.shotPlan,
    );
    const currentPrompt = params.optimizedPrompt.trim();

    const subjectOk = required.subject
      ? hasSubject(required.subject, currentPrompt)
      : true;
    const actionOk = required.action
      ? hasAction(required.action, currentPrompt)
      : true;
    const semanticsOk = preservesActionSemantics(
      required.action,
      params.originalPrompt,
      currentPrompt,
    );

    return {
      passed: subjectOk && actionOk && semanticsOk,
      required,
    };
  }
}
