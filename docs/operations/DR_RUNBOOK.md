# Data recovery acceptance

Export/restore wrappers remain in `scripts/ops/firestore-export.sh` and `scripts/ops/firestore-restore.sh`. Start with an emulator restore and verify the exact project, backup and expected record counts before any live restore. A live restore requires explicit authorization.

The older `dr-smoke-test` program checked obsolete `credit_balances` records and could report success on an empty collection; it is retired. Its historical pass does not verify the preserved refund ledger.

Current integrity boundaries include generic sessions/takes, `video_jobs`, `video_job_dlq`, request receipts and owed attachments; legacy credit data lives on `users/{uid}.credits`, nested `credit_transactions`, `credit_refunds` and the failed-refund store. Use the collection constants and parsers in the current admission/session/runtime/refund owners when selecting an export and validating a restore.

Acceptance must compare expected counts and representative identities, destinations, provenance, media handles, claim/receipt consistency and refund keys/debt states against the chosen backup. Include nested ledger rows, completion/attachment state and durable media objects. An empty unexpected collection is non-verification, not success. Reconcile discrepancies before enabling writers.

Bootstrap tests check application contracts against fixtures; they do not validate restored production records. Source cleanup performs no export, restore, ledger drain, mutation or media deletion.

## Verified emulator restore

The restore wrapper downloads one export to temporary storage, starts a **fresh** loopback Firestore emulator with [Firebase CLI `--import`](https://firebase.google.com/docs/emulator-suite/connect_firestore#import_and_export_data), and runs acceptance before shutting it down. Stop any emulator using the selected port first; this command does not replace a running instance. It accepts Firebase exports and managed Firestore exports containing an overall metadata file. Emulator projects must use the `demo-` prefix. No live import is needed to test a backup.

```sh
scripts/ops/firestore-restore.sh --source gs://backup-bucket/exports/chosen-backup \
  --target emulator --project demo-restore --expect /absolute/path/acceptance.json
```

Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` to select a loopback port (the default). An occupied port, invalid/missing export, import failure, HTTP failure, malformed response, mismatched count/field or missing verification proof exits nonzero. Successful Firebase process exit alone is insufficient. Only the completed acceptance prints “Emulator restore verified”.

The acceptance file names the exact emulator project, collection counts and representative document fields. Include at least one nonempty collection and one document sample. Collection paths may name nested ledgers; document fields use dot paths for nested facts. For example:

```json
{
  "projectId": "demo-restore",
  "collections": [{ "path": "sessions", "count": 1 }],
  "documents": [{ "path": "sessions/example", "fields": { "userId": "expected-owner" } }]
}
```

Use independently recorded backup counts and identities, including nested ledger rows and the provenance/claim/media facts above. The example is a format illustration, not a production acceptance baseline. The command verifies only the supplied counts and sampled fields; media-object integrity and broader semantic acceptance remain the operator's checks. A live restore keeps the explicit project confirmation and still requires separate execution authorization.
