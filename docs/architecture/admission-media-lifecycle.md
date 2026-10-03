# Admission media lifecycle and dry-run inventory (#137)

**Status:** Copy isolation and inspection implemented. Cleanup disabled. Retention
period and permission to enable deletion remain an owner decision.

ADR-0022 decisions 4–6 govern copies and resumable admissions. This document does
not reopen the frozen retention workers in ADR-0002.

The [consistency audit's namespace table](../audits/2026-10-03-docs-consistency.md#actual-storage-defaults)
records the current storage defaults. Sketch snapshots use the image-asset store;
studio bridge copies use general owner-scoped raster storage. A feature name is
not a bucket prefix, and configured paths must be read from the deployment.

## Ownership and lifetime

| Object                                                   | Owner of the durable reference                      | Protection                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session picture/clip, including an accepted studio image | Session take                                        | Keep while any take, keyframe, share, job or recovery record references it. Archive is not deletion.                                              |
| Sketch snapshot                                          | Take source inputs and admission receipt            | Keep through pending/failed attachment and replay, even if a signed URL expired.                                                                  |
| Studio bridge copy                                       | Studio project attachment                           | Independent of the originating session's media. Deleting the session must leave this copy readable.                                               |
| Returned studio picture                                  | Destination session take                            | A new independent copy. Deleting its producing studio project must leave it readable. Its source-input references also remain protected.          |
| Losing bridge copy                                       | No project won ownership of this copy               | Inspect as a candidate only when no record references its exact path or identity. The winning project's attachment always survives.               |
| Snapshot left by a duplicate or failed acceptance        | No take/receipt references that particular snapshot | Inspect as a candidate only after complete reference inventory and no in-flight work. A failed attachment's referenced snapshot is not abandoned. |
| Historical object without lifecycle metadata             | Unknown                                             | Do not infer ownership or deletion eligibility from age, filename, URL expiry or byte equality.                                                   |

Deletion of a studio project removes its records and turns, not media objects.
Deletion of a session removes the session and cancels its jobs, not another
record's independent media. Cross-mode replay tests exercise both deletion
routes, reopen the surviving destination, and compare readable bytes.

## Inspect without deleting

New sketch snapshots carry `admissionSource=sketch-snapshot` in GCS metadata.
Studio bridge copies already carry `studioProjectId`, `originSessionId` and
`originGenerationId`. Metadata identifies an object's purpose; references decide
whether it is still in use. A losing-bridge log alone is not deletion authority.

Export all Firestore collections recursively, including subcollections below
missing parent documents, and every configured media bucket. Use a new output
path; the exporter refuses to overwrite an existing inventory:

```bash
npx tsx scripts/ops/export-admission-media-inventory.ts /tmp/vidra-media-inventory.json IMAGE_BUCKET VIDEO_BUCKET ASSET_BUCKET
npx tsx scripts/ops/inspect-admission-media.ts /tmp/vidra-media-inventory.json
```

Replace bucket names with this deployment's actual buckets. The exporter reads
using existing Firebase/GCP credentials, performs no writes to either service,
and fails if any read fails. Do not use a paginated UI list as an inventory.
The inventory contains private record data: keep it local or in the existing
restricted evidence store, not in the repository.

The inspector validates its input and reports each object with its bucket,
path, generation, byte size, kind, referring document paths and disposition:

- **referenced**: any exported record names its path, asset identity or GCS URL.
  Archived takes, source inputs, expired URLs, admission receipts and owed
  attachment records all count. No expiry-based exception exists.
- **candidate**: a tagged snapshot/bridge has no recorded reference in a complete
  inventory and no admission/job/studio work is in flight. This means unreferenced
  at inspection time, not safe to delete.
- **unknown**: incomplete evidence, in-flight work, or absent lifecycle metadata.

`deletionEnabled` and every `deletionAllowed` are always false. A partial inventory
exits 2 rather than reporting verified abandonment. The example report under
`docs/architecture/examples/` uses synthetic data and demonstrates the format;
it is not a production inventory or a live-adapter qualification.

## Retention decision still needed

Do not enable age-based cleanup. Before any deletion capability is added, the
owner must choose the retention/recovery window and the eligible namespaces.
A future deletion must re-read current references and in-flight admissions,
prove the object was created before the scan, and use the exact inventoried
bucket/path/generation with a GCS generation precondition. A scan is not atomic
with new admissions, so an old report can never authorize a later deletion.

The referenced-copy and recovery tests must remain negative deletion tests if
cleanup is ever enabled. Existing frozen retention APIs are not used or widened
by this work. Local-storage fallbacks without GCS metadata remain unclassified;
this inspector deliberately does not crawl or delete local files.

## Verification recorded 2026-10-03

The offline replay suite passed 36 tests, including both HTTP deletion-isolation
checks. The real-adapter suite passed all 17 tests against local Firestore and
Auth emulators, with production GCS adapters over the conformance bucket. Run it
with the project id aligned to the emulator (the local development project is
different):

```bash
VITE_FIREBASE_PROJECT_ID=demo-test firebase emulators:exec --project demo-test --only firestore,auth 'npx vitest run --config config/test/vitest.integration.config.js tests/integration/cross-mode-real-adapters.integration.test.ts'
```

These are emulator/controlled-storage proofs, not deployed-environment acceptance.
No production bucket inventory was run and no object was deleted by the inspector.
