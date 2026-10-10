# Data recovery acceptance

Export/restore wrappers remain in `scripts/ops/firestore-export.sh` and `scripts/ops/firestore-restore.sh`. Start with an emulator restore and verify the exact project, backup and expected record counts before any live restore. A live restore requires explicit authorization.

The older `dr-smoke-test` program checked obsolete `credit_balances` records and could report success on an empty collection; it is retired. Its historical pass does not verify the preserved refund ledger.

Current integrity boundaries include generic sessions/takes, `video_jobs`, `video_job_dlq`, request receipts and owed attachments; legacy credit data lives on `users/{uid}.credits`, nested `credit_transactions`, `credit_refunds` and the failed-refund store. Use the collection constants and parsers in the current admission/session/runtime/refund owners when selecting an export and validating a restore.

Acceptance must compare expected counts and representative identities, destinations, provenance, media handles, claim/receipt consistency and refund keys/debt states against the chosen backup. Include nested ledger rows, completion/attachment state and durable media objects. An empty unexpected collection is non-verification, not success. Reconcile discrepancies before enabling writers.

Bootstrap/replay tests check application contracts against fixtures; they do not validate restored production records. Source cleanup performs no export, restore, ledger drain, mutation or media deletion.
