# Supported provider quality evaluation (#144)

The executable harness prepares inspectable request-conformance evidence and a
creative review matrix. It does **not** establish output quality from canned
responses. Issue #144 stays open until the owner reviews the task set and actual
outputs, each supported path has live evidence, and #143 supplies the real HTTP
clip acceptance evidence.

## Run the offline matrix

```bash
LOG_LEVEL=error npx tsx scripts/ops/provider-quality/run.ts --report /tmp/vidra-provider-quality.json
npx vitest run scripts/ops/provider-quality/__tests__ --config config/test/vitest.config.js
```

The harness never forwards a provider request. Real production registries,
adapters and SDKs run against a fetch transport that accepts only explicitly
listed fixture requests and refuses everything else. No credential environment
variables are loaded or consulted for provider dispatch. The sketch route uses
an ephemeral local socket and controlled creator/persistence boundaries; this
does not prove deployed authentication. Provider headers are excluded from
reports.

The JSON records the Git revision, working-tree status, model, configuration,
assertions, actual HTTP-submitted parameters, and result for every path. The
working-tree status distinguishes an uncommitted run from commit-specific
evidence. Source/output fixture URLs are deliberately non-live. Controlled
output bytes prove neither decoding nor playback.

Exit 0 means the offline contract assertions passed and creative quality is
still pending. Exit 1 means a per-path contract failed; inspect `reason` and
`diagnosticCode`. Invalid arguments exit 2. A green harness **test suite** means
the reporting machinery behaves correctly, including correctly reporting a
known product defect. It does not mean the evaluation report is green.

The implemented matrix currently has 134 rows: 128 contract passes and six
Luma model-mismatch diagnostics, with no omitted callable provider. Counts may
change with the canonical roster. These are offline results, not live provider
qualification.

## Coverage and boundaries

| Surface                     | Executed boundary                                                                                           | Cases and evidence                                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio generation           | Canonical `StudioModelRegistry` → real `ReplicateStudioImageRunner` → SDK HTTP                              | Every offerable model; every studio aspect ratio plus invalid-ratio fallback; actual endpoint, prompt and pinned resolution/quality fields                                                |
| Studio edit                 | Same registry/runner/SDK                                                                                    | Every offerable edit-capable model; exact source-image array, instruction, format and price tier                                                                                          |
| Studio transform            | Same registry/runner/SDK                                                                                    | `remove_background`, `vectorize`; exact utility endpoint and source parameter                                                                                                             |
| Studio routing/pins         | Real `StudioService`, `StudioPolicyEngine`, `AIModelService`, `LLMClient`, OpenAI adapter and Replicate SDK | Auto generate, pinned Pro generate, Auto standard edit, pinned Lite edit, incapable pin negotiation with zero image calls. Only external LLM/persistence/storage responses are controlled |
| First-frame image providers | Real Schnell/Kontext adapters → SDK HTTP                                                                    | Explicit provider selection; square, landscape, portrait and invalid-ratio normalization; source, seed, speed and quality fields where accepted                                           |
| Replicate video             | Canonical generation roster → real video adapter → SDK HTTP                                                 | All Replicate entries, including Wan, Mochi and Minimax; text/image modes; square, landscape, portrait; effective model mapping, frame, seed, size/duration and prompt expansion          |
| Sora                        | Actual OpenAI SDK multipart boundary                                                                        | Both callable variants; text/image modes and three aspects; exact prompt, duration, normalized size and image-reference object                                                            |
| Kling                       | Actual HTTP create/status boundary                                                                          | Text/image modes and three aspects; exact prompt, first frame, model, ratio and supported duration                                                                                        |
| Luma                        | Actual Luma SDK HTTP boundary                                                                               | Text/image modes and three aspects; exact submitted model, prompt, keyframe and ratio; model mismatch reported as failure                                                                 |
| Veo                         | Actual HTTP create/status/media boundary                                                                    | Text/image modes and three aspects; effective endpoint, exact prompt, inline first frame, seed and duration                                                                               |
| Sketch                      | Real `/api/fal/i2i` relay → fal HTTP boundary                                                               | Exact prompt, source, strength, steps, seed, synchronous mode and webp output                                                                                                             |

Video inventory derives from `VIDEO_MODEL_PROVIDERS`; there is no Runway
generation adapter, so the recommendation-only Runway model is not a callable
path. Studio inventory derives from `offerableModels`; storage-gated entries
are included only when offered. Future adapter/roster changes should extend the
matrix, and the report must name gaps instead of implying coverage.

The ordinary registry/adapter cases exercise deterministic request shaping;
the routing cases additionally execute the real studio decision loop. Neither
proves that a live LLM will choose a good edit instruction or a live image model
will preserve the scene. Seed is requested for the video matrix but only
asserted where the production adapter supports it; reports retain the actual
submitted body so dropped fields are visible.

Per-model studio budgets and current video polling budgets are recorded. The
focused suite drives a real processing studio prediction to its 60-second
polling deadline with controlled time. Existing provider poll-resilience and
timeout suites remain the broader timing evidence. The Replicate video adapter
currently supplies no app-level deadline to `replicate.run`; its report records
`timeoutMs: null`. None of this qualifies a hung provider create/download call
or deployed workflow watchdog behavior.

### Known model mismatch

The canonical `luma-ray3` path submits `model: "ray-2"` through the legacy Luma
adapter. All six Luma cases capture that actual request and report
`diagnosticCode: "luma-model-mismatch"`; the evaluation exits 1. The canonical
name cannot establish that Ray 3 was evaluated when Ray 2 received the request.

The [legacy JavaScript video documentation](https://docs.lumalabs.ai/docs/javascript-video-generation)
shows the Ray 2 generation endpoint. The current
[migration guide](https://docs.agents.lumalabs.ai/guides/videos/migration/) and
[model guide](https://docs.agents.lumalabs.ai/guides/model/) describe the newer
API and Ray 3.2. An unqualified model-string swap on the legacy SDK is not a
demonstrated migration. This batch records the mismatch and changes neither
the provider adapter nor its baseline/default.

## Human creative review

`scripts/ops/provider-quality/creative-tasks.json` contains seven small tasks:
composition across aspects, recolor preservation, background removal,
vectorization, push-in versus static motion, incapable-pin negotiation, and
sketch fidelity. The task set is **prepared, awaiting owner approval**.
`owner-review.pending.json` has no review evidence and intentionally fails the
review schema. Do not relabel either as approved on the basis of offline tests.

Run real creative outputs only through the existing authorized smoke/intake
boundaries and within their spending rules. The harness adds no paid-live mode,
changes no budget policy, and does not authorize a provider matrix of paid
generations. The four-leg live smoke (#140) establishes bounded provider
acceptance, not final-clip quality. The real intake clip, first-frame selection,
visible motion words, durable attachment, reopen and download remain #143.

For each reviewed task/path, record this `vidra-creative-review/v1` shape:

```json
{
  "schema": "vidra-creative-review/v1",
  "taskSet": "creative-tasks/v1",
  "ownerApproval": {
    "reviewer": "actual owner",
    "reviewedAt": "actual ISO timestamp",
    "notes": "Task-set approval and any changes"
  },
  "results": [
    {
      "taskId": "recolor-preservation",
      "pathId": "studio/edit/nano-banana-2",
      "model": "google/nano-banana-2",
      "revision": "40-character tested commit SHA",
      "configuration": { "resolution": "1K" },
      "submittedRequestEvidence": "path to captured real provider request",
      "sourceEvidence": [
        { "path": "source image", "sha256": "64-character source digest" }
      ],
      "outputEvidence": [
        { "path": "actual output", "sha256": "64-character output digest" }
      ],
      "reviewer": "actual reviewer",
      "reviewedAt": "actual ISO timestamp",
      "verdict": "acceptable",
      "observations": "What changed, what stayed intact, and any unwanted differences"
    }
  ]
}
```

`acceptable`, `unacceptable`, and `inconclusive` are human judgments. Include
both motion/control clips in output evidence. For preservation tasks, use the
source hash and record every unintended change, including attractive repaints
that violate the requested edit. Keep the submitted motion words with the
provider-request evidence. Preserve negative/inconclusive results.

```bash
npx tsx scripts/ops/provider-quality/check-review.ts owner-review.json /tmp/vidra-provider-quality.json /tmp/vidra-review-coverage.json
```

The checker validates schema, rejects duplicate task/path records, requires
source evidence for applicable tasks, and reports missing or unacceptable rows
against the current inventory. Invalid aspect-ratio probes are deterministic
contract cases and are excluded from the creative matrix. An acceptable result
record exits 0; missing, unacceptable, invalid or pending evidence exits 2.
The checker verifies recorded completeness only: it cannot authenticate the
owner, inspect image quality, or prove that the linked artifacts were generated
live. Those remain explicit review and acceptance obligations.

The harness is scoped to #144. It does not revive frozen analytics, alter the
Groq golden-set baseline (#106), establish production rollout acceptance (#145),
or substitute for the all-shells walkthrough (#65).
