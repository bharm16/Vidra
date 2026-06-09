# `ContinuityMediaService` is a cohesive continuity-media facade, not a shallow pass-through to split

**Status:** accepted

`ContinuityMediaService` (`server/src/services/continuity/ContinuityMediaService.ts`)
holds six media collaborators (`frameBridge`, `styleReference`, `styleAnalysis`,
`videoGenerator`, `assetService`, `storageService`) and exposes ten methods,
roughly half of which are one-line forwards (`generateVideo`,
`extractBridgeFrame`, `extractRepresentativeFrame`, `createStyleReferenceFromVideo`,
`generateStyledKeyframe`). At a glance this reads as a **shallow** module — an
interface nearly as wide as its implementation — and an architecture review will
recur to the suggestion: "split the thin forwarding facade from the real
orchestration." We considered that split and are **keeping the module whole**.

The forwards do not make the module shallow:

- **`getVideoUrl` anchors real depth.** It has seven call sites and genuine
  behavior: resolve the direct provider URL, fall back to a storage signed URL,
  swallow-and-log storage failures. Deleting it would make that fallback reappear
  across all seven callers.
- **Two forwards are dual-use internal building blocks.**
  `createStyleReferenceFromVideoAsset` calls `this.extractRepresentativeFrame`
  and `this.createStyleReferenceFromVideo` inside its ffmpeg-missing fallback
  chain. They are not pure pass-throughs for external callers; the orchestration
  itself needs them.
- **The remaining forwards aggregate dependencies.** `ContinuityShotGenerator`
  and `ContinuitySessionService` take a single `mediaService` dependency instead
  of injecting `frameBridge` / `videoGenerator` / `styleReference` separately.

The deletion test settles it: deleting the forwards does not make complexity
vanish — it **relocates** it into the two continuity orchestrators' constructors
and the DI wiring. A module whose deletion moves complexity rather than removing
it is earning its keep.

## Considered and deferred

Splitting into a `MediaCollaborators` thin facade plus a deep
`StyleReferenceOrchestrator` is plausible but **declined**. It would churn
`ContinuityShotGenerator`, `ContinuitySessionService`, and
`continuity.services.ts` DI registration, add a second injection point for
callers, and still not remove complexity — only reshape it. The module is gated
behind `ENABLE_CONVERGENCE` and is not a maintenance pain point.

## Consequences / things to know

- The module is cohesive around one domain: turning continuity media (videos,
  frames, images) into style references, keyframes, and resolvable URLs.
- If `getVideoUrl`'s storage fallback or the ffmpeg-missing synthetic-frame
  fallback ever moves elsewhere, re-evaluate — the depth anchor would be gone.
- Do not re-flag the one-line forwards as "shallow, extract" without first
  re-running the deletion test against the current call sites.
