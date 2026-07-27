import type {
  ReplayCassetteEntry,
  ReplayContractName,
} from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { validateEntryPayload } from "./contracts";
import { ReplayError } from "./errors";

export type ReplayMode = "record" | "replay";

/** The seam discriminant — the cassette contract already names every seam. */
export type ReplaySeamName = ReplayCassetteEntry["seam"];

type EntryFor<S extends ReplaySeamName> = Extract<
  ReplayCassetteEntry,
  { seam: S }
>;

/** The request DTO a seam derives its cassette key from. */
export type ReplayRequestFor<S extends ReplaySeamName> = EntryFor<S>["request"];

/** The payload shape a seam persists into (and replays out of) a cassette. */
export type ReplayRecordedFor<S extends ReplaySeamName> =
  EntryFor<S>["response"];

interface ReplaySeamCall<S extends ReplaySeamName, TLive> {
  /** The semantic request DTO — hashed into the cassette key. */
  request: ReplayRequestFor<S>;
  /** Human-readable call description, used in the cassette-miss error. */
  summary: string;
  /** Scenario label for contract-violation context. */
  scenario: string;
  /** Which payload contract the recorded response must satisfy. */
  contract: ReplayContractName;
  /** The live provider call. Only invoked in record mode. */
  live: () => Promise<TLive>;
  /**
   * Maps the live response onto the recorded payload. Kept separate from the
   * return value so record mode hands callers the untouched live object.
   */
  toRecorded: (response: TLive) => ReplayRecordedFor<S>;
}

/**
 * The one record/replay protocol, shared by every seam.
 *
 * Every seam runs the same five steps — build a request DTO, derive a key,
 * then either serve the recording (lookup, seam-discriminant check, contract
 * validation, defensive clone) or call through and capture. Each adapter
 * supplies only what is genuinely seam-specific: the request mapper, the key
 * function, and the contract name.
 *
 * Type parameter `S` is the seam discriminant from `ReplayCassetteEntry`, so
 * the request and recorded-payload types are derived from the shared contract
 * rather than restated per adapter.
 */
export class ReplaySeam<S extends ReplaySeamName> {
  private readonly seam: S;
  private readonly store: CassetteStore;
  private readonly keyOf: (request: ReplayRequestFor<S>) => string;
  readonly mode: ReplayMode;

  constructor({
    seam,
    mode,
    store,
    keyOf,
  }: {
    seam: S;
    mode: ReplayMode;
    store: CassetteStore;
    keyOf: (request: ReplayRequestFor<S>) => string;
  }) {
    this.seam = seam;
    this.mode = mode;
    this.store = store;
    this.keyOf = keyOf;
  }

  get isReplaying(): boolean {
    return this.mode === "replay";
  }

  /**
   * Replay mode: serve the contract-validated recording, or throw loudly.
   * Record mode: call through to the live provider and capture the pair.
   */
  async through<TLive>({
    request,
    summary,
    scenario,
    contract,
    live,
    toRecorded,
  }: ReplaySeamCall<S, TLive>): Promise<TLive | ReplayRecordedFor<S>> {
    const key = this.keyOf(request);

    if (this.mode === "replay") {
      const entry = this.store.lookupOrThrow(key, summary);
      if (entry.seam !== this.seam) {
        throw new ReplayError(
          `Replay entry for key ${key} is not a ${this.seam} recording`,
        );
      }
      // Replay-time contract validation: drifted contracts fail loudly here.
      validateEntryPayload(entry, { surface: "replay-lookup", scenario });
      // Defensive clone: callers must never be able to mutate the store.
      // `ReplayRecordedFor<S>` stays deferred while `S` is unresolved, so the
      // cast names the union member the guard above already established.
      return structuredClone(entry.response) as TLive | ReplayRecordedFor<S>;
    }

    const response = await live();
    // The generic seam name cannot narrow the discriminated union on its own;
    // the field types above already come from the same union member.
    this.store.record({
      seam: this.seam,
      key,
      contract,
      request,
      response: toRecorded(response),
    } as ReplayCassetteEntry);
    return response;
  }
}
