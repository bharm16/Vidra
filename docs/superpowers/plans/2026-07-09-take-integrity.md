# Take Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox syntax for tracking.

**Goal:** Make every successful generated picture or clip have one canonical
media write and one validated, transactionally persisted Take.

**Architecture:** New writes use a strict shared Take union. SessionStore owns
atomic Take mutations. Image generation persists through the existing
Preview-image ownership verb; video generation uses its existing
VideoAssetStore result directly. A shared completion path persists the Take
before marking a run completed and reuses the job media checkpoint on retry.

**Tech Stack:** TypeScript, Zod, Express, Firestore transactions, Vitest.

---

### Task 1: Strict Take write contract with legacy read compatibility

**Files:**

- Create: shared/schemas/sessionTake.schemas.ts
- Modify: shared/types/session.ts
- Modify: shared/schemas/session.schemas.ts
- Create: tests/unit/session-take-contract.regression.test.ts

- [ ] **Step 1: Print the bugfix pre-test checklist**

```
1. Failure boundary: service output
2. Mock boundary: none
3. Invariant: For every newly persisted Take, media kind, identity, lineage, completion, and media location are runtime-valid.
```

- [ ] **Step 2: Write the failing contract test**

The test imports SessionTakeSchema and proves that a picture and clip parse,
that a missing clip mediaType fails, and that SessionPromptVersionEntrySchema
still accepts a legacy generation bag for reads.

```ts
expect(
  SessionTakeSchema.safeParse({
    schemaVersion: 2,
    id: "clip-1",
    mediaType: "video",
    status: "completed",
    prompt: "visible words",
    promptVersionId: "v-1",
    mediaUrls: ["https://media.example/clip"],
    mediaAssetIds: ["asset-1"],
    ancestorGenerationId: "picture-1",
    archived: false,
    completedAt: "2026-07-09T00:00:00.000Z",
  }).success,
).toBe(true);

expect(
  SessionTakeSchema.safeParse({
    schemaVersion: 2,
    id: "clip-1",
    status: "completed",
  }).success,
).toBe(false);
```

- [ ] **Step 3: Run RED**

Run:

```bash
npx vitest run tests/unit/session-take-contract.regression.test.ts --config config/test/vitest.unit.config.js
```

Expected: FAIL because SessionTakeSchema does not exist.

- [ ] **Step 4: Add the strict schema and types**

Define a common base and a discriminated union for image, image-sequence, and
video. New writes use SessionTake. Keep LegacySessionGenerationRecord only in
the read DTO union.

```ts
const SessionTakeBaseSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  status: z.literal("completed"),
  prompt: z.string(),
  promptVersionId: z.string().min(1),
  mediaUrls: z.array(z.string().url()).min(1),
  mediaAssetIds: z.array(z.string().min(1)).optional(),
  ancestorGenerationId: z.string().min(1).nullable(),
  archived: z.boolean(),
  completedAt: z.string().datetime(),
  model: z.string().min(1).optional(),
});

export const SessionTakeSchema = z.discriminatedUnion("mediaType", [
  SessionTakeBaseSchema.extend({ mediaType: z.literal("image") }),
  SessionTakeBaseSchema.extend({ mediaType: z.literal("image-sequence") }),
  SessionTakeBaseSchema.extend({ mediaType: z.literal("video") }),
]);
```

- [ ] **Step 5: Run GREEN and contract neighbors**

```bash
npx vitest run tests/unit/session-take-contract.regression.test.ts tests/unit/session-dto.contract.test.ts --config config/test/vitest.unit.config.js
npx tsc --noEmit
```

Expected: PASS.

### Task 2: Atomic Take upsert and archive

**Files:**

- Modify: server/src/services/sessions/SessionStore.ts
- Modify: server/src/services/sessions/SessionService.ts
- Create: server/src/services/sessions/**tests**/SessionStore.take-mutations.regression.test.ts
- Add cases only: server/src/services/sessions/**tests**/SessionService.test.ts

- [ ] **Step 1: Print the bugfix pre-test checklist**

```
1. Failure boundary: service output
2. Mock boundary: Firestore only
3. Invariant: For any concurrent Take mutations in one session, no accepted append is lost and no live parent is archived.
```

- [ ] **Step 2: Write failing concurrent mutation tests**

Use the existing Firebase mock style. Start two upserts from the same initial
document and assert both ids survive. Race a child append with parent archive
and assert the final document either contains the live edge with an unarchived
parent or rejects the archive.

- [ ] **Step 3: Run RED**

```bash
npx vitest run server/src/services/sessions/__tests__/SessionStore.take-mutations.regression.test.ts --config config/test/vitest.unit.config.js
```

Expected: FAIL because SessionStore has no atomic Take mutations.

- [ ] **Step 4: Implement mutations in SessionStore**

Add concrete methods on the existing store, not another storage interface.
Each method reads and writes inside one Firestore transaction and checks
userId from the transaction snapshot.

```ts
async upsertTake(
  userId: string,
  sessionId: string,
  promptVersionId: string,
  take: SessionTake,
): Promise<SessionRecord> {
  return this.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(this.collection.doc(sessionId));
    const current = this.requireOwnedStoredSession(snapshot, userId);
    const next = upsertTakeInStoredSession(current, promptVersionId, take);
    transaction.set(snapshot.ref, this.toStored(next), { merge: true });
    return next;
  });
}
```

Archive performs its live-child check inside the same transaction.
SessionService validates with SessionTakeSchema and delegates.

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run server/src/services/sessions/__tests__/SessionStore.take-mutations.regression.test.ts server/src/services/sessions/__tests__/SessionService.test.ts --config config/test/vitest.unit.config.js
npx tsc --noEmit
```

Expected: PASS.

### Task 3: One persistence owner for first frames

**Files:**

- Modify: server/src/services/storage/StorageService.ts
- Modify: server/src/services/image-generation/ImageGenerationService.ts
- Modify: server/src/config/services/image-generation.services.ts
- Modify: server/src/routes/preview/handlers/imageGenerate.ts
- Create: server/src/routes/preview/handlers/**tests**/imageGenerate.single-persistence.regression.test.ts
- Add case only: server/src/services/image-generation/**tests**/ImageGenerationService.test.ts
- Modify: CONTEXT.md

- [ ] **Step 1: Print the bugfix pre-test checklist**

```
1. Failure boundary: service output
2. Mock boundary: provider HTTP and cloud storage
3. Invariant: For every successful first frame, exactly one durable media write supplies both the response and picture Take.
```

- [ ] **Step 2: Write the failing single-write test**

Construct the real ImageGenerationService and real image route handler with
provider/cloud boundaries faked. Assert one storage write total, no second
saveFromUrl call, and the Take uses the same canonical view URL and asset id.

- [ ] **Step 3: Run RED**

```bash
npx vitest run server/src/routes/preview/handlers/__tests__/imageGenerate.single-persistence.regression.test.ts --config config/test/vitest.unit.config.js
```

Expected: FAIL with two durable writes.

- [ ] **Step 4: Deepen Preview-image persistence**

Add a StorageService verb that accepts a provider URL while keeping
PREVIEW_IMAGE and image/png internal. Return a canonical descriptor including
assetId. Inject StorageService into ImageGenerationService, replace its active
ImageAssetStore write, and remove the route-level persistence pass.

```ts
async savePreviewImageFromUrl(
  userId: string,
  sourceUrl: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredMediaDescriptor> {
  return this.saveTypedFromUrl(userId, sourceUrl, STORAGE_TYPES.PREVIEW_IMAGE, metadata);
}
```

ImageGenerationService returns that descriptor; imageGenerate builds the Take
directly from it. Update the Preview-image persistence glossary entry to name
both buffer and provider-URL verbs under the same StorageService ownership.

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run server/src/routes/preview/handlers/__tests__/imageGenerate.single-persistence.regression.test.ts server/src/services/image-generation/__tests__/ImageGenerationService.test.ts server/src/services/storage/__tests__/StorageService.test.ts --config config/test/vitest.unit.config.js
npx tsc --noEmit
```

Expected: PASS.

### Task 4: Canonical video result and resumable checkpoint

**Files:**

- Modify: server/src/services/video-generation/jobs/types.ts
- Modify: server/src/services/video-generation/jobs/schemas.ts
- Modify: server/src/services/video-generation/jobs/parseVideoJobRecord.ts
- Modify: server/src/services/video-generation/jobs/processVideoJob.ts
- Create: server/src/services/video-generation/jobs/**tests**/processVideoJob.canonical-media.regression.test.ts

- [ ] **Step 1: Print the bugfix pre-test checklist**

```
1. Failure boundary: service output
2. Mock boundary: video provider and Firestore job store
3. Invariant: For any retried run with a stored-media checkpoint, the provider is not invoked again and no second media copy is created.
```

- [ ] **Step 2: Write the failing checkpoint test**

Pass a job containing providerResult with canonical assetId, URL, content type,
and size. Assert generateVideo and StorageService.saveFromUrl are not called,
while completion receives that descriptor.

- [ ] **Step 3: Run RED**

```bash
npx vitest run server/src/services/video-generation/jobs/__tests__/processVideoJob.canonical-media.regression.test.ts --config config/test/vitest.unit.config.js
```

Expected: FAIL because providerResult is discarded by parsing and processing.

- [ ] **Step 4: Make the checkpoint part of VideoJobRecord**

Add the existing providerResult document field to schema, type, and parser.
Treat VideoGenerationService output as already durable because its provider
adapters store through VideoAssetStore. Remove JobStorageService and the second
saveFromUrl pass. Reuse providerResult when present.

```ts
const result = job.providerResult
  ? toVideoGenerationResult(job.providerResult)
  : await videoGenerationService.generateVideo(
      job.request.prompt,
      job.request.options,
      signal,
    );
```

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run server/src/services/video-generation/jobs/__tests__/processVideoJob.canonical-media.regression.test.ts server/src/services/video-generation/__tests__/generateVideoWorkflow.test.ts --config config/test/vitest.unit.config.js
npx tsc --noEmit
```

Expected: PASS.

### Task 5: Take-before-completed parity for inline and worker execution

**Files:**

- Modify: server/src/services/video-generation/jobs/processVideoJob.ts
- Modify: server/src/services/video-generation/jobs/VideoJobHandler.ts
- Modify: server/src/routes/preview/inlineProcessor.ts
- Modify: server/src/routes/preview/handlers/video-generate/intake.ts
- Modify: server/src/routes/preview/handlers/video-generate/types.ts
- Create: server/src/services/video-generation/jobs/**tests**/processVideoJob.take-completion.regression.test.ts
- Create: server/src/routes/preview/**tests**/inlineProcessor.take-completion.regression.test.ts

- [ ] **Step 1: Print the bugfix pre-test checklist**

```
1. Failure boundary: service output
2. Mock boundary: provider, Firestore, and cloud storage
3. Invariant: For every lineage-bearing clip run, both executors persist a reloadable video Take before reporting completed.
```

- [ ] **Step 2: Write failing ordering and parity tests**

Assert append occurs before markCompleted, append failure prevents
markCompleted, the record includes mediaType video and canonical media URL,
and inline passes the same real SessionService dependency as the worker.

- [ ] **Step 3: Run RED**

```bash
npx vitest run server/src/services/video-generation/jobs/__tests__/processVideoJob.take-completion.regression.test.ts server/src/routes/preview/__tests__/inlineProcessor.take-completion.regression.test.ts --config config/test/vitest.unit.config.js
```

Expected: FAIL because append currently occurs after completion and inline omits
the dependency.

- [ ] **Step 4: Implement the completion invariant**

Require the Take writer when both lineage ids are present. Build and validate a
SessionTake, upsert it, then mark completed. Thread SessionService through
video intake and the inline scheduler. Keep jobs without lineage ids backward
compatible.

- [ ] **Step 5: Run GREEN and the foundation regression set**

```bash
npx vitest run tests/unit/session-take-contract.regression.test.ts server/src/services/sessions/__tests__/SessionStore.take-mutations.regression.test.ts server/src/routes/preview/handlers/__tests__/imageGenerate.single-persistence.regression.test.ts server/src/services/video-generation/jobs/__tests__/processVideoJob.canonical-media.regression.test.ts server/src/services/video-generation/jobs/__tests__/processVideoJob.take-completion.regression.test.ts server/src/routes/preview/__tests__/inlineProcessor.take-completion.regression.test.ts --config config/test/vitest.unit.config.js
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js . --quiet
```

Expected: PASS with no errors.

### Task 6: Foundation integration gate

**Files:**

- Create: tests/integration/preview-take-persistence.integration.test.ts
- Add cases only: client/src/features/space/lineage/**tests**/deriveSpaceNodesFromVersions.test.ts

- [ ] **Step 1: Add the end-to-end contract tests**

Exercise picture and clip completion through the real route/session chain with
only provider and Firebase/storage boundaries faked. Fetch the session DTO,
parse it, derive space nodes, and assert the media/lineage is reloadable.

- [ ] **Step 2: Run focused integration and architecture gates**

```bash
PORT=0 npx vitest run tests/integration/preview-take-persistence.integration.test.ts tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
npm run arch:forbidden-imports
npm run arch:cycles:server
```

Expected: PASS.

- [ ] **Step 3: Run the commit protocol**

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js . --quiet
npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Commit the slice**

```bash
git add shared server/src client/src/features/space/lineage tests/integration CONTEXT.md docs/superpowers
git commit -m "fix: make Take completion durable and canonical"
```
