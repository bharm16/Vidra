# Free testing now; billing and creator spending caps later (#120)

**Status:** Accepted — 2026-10-03. Owner: Bryce Harmon, explicit approval in the
implementation conversation: “free”; creator caps “shouldnt block our work here.
just save it for later”; real generation testing allowance “$10”.

## Decision

Vidra is free during this testing phase. Signed-in creators can make pictures and
clips, reopen them, download them and use the existing share action without
customer credits, checkout or a paid Keep contract. Authentication, ownership,
request validation, existing rate limits and timeouts still apply.

The owner explicitly deferred #123's new per-creator spending caps. They do not
block #124's free HTTP intake or its browser and live tests. This revises the
original #120/#123/#124 ordering. Existing sketch/studio allowances remain; no
new $5 creator cap or $25 application cap is approved. The earlier draft's
numbers were proposals and are superseded.

The **total additional provider spend for this implementation and live-testing
work is $10**, shared by all tests and providers, not $10 per run or per agent.
Record each dispatch and a conservative cost bound before making it. Count failed
requests and retries when they can incur charges. Stop before the remaining
allowance is insufficient; an unknown cost is not permission to exceed $10.
Offline tests and browser tests with controlled providers do not consume it.

This is an owner-supervised development decision, not approval for an unrestricted
public launch. Use the project's existing local development, Firebase/emulator,
Playwright and deployment setup. No new testing service is needed.

## Narrow amendment to the frozen code boundary

This supplements ADR-0002 and ADR-0022 decisions 6 and 8 only for the active
quick-picture and clip HTTP paths: remove their credit requirement, retain
ownership checks and make idempotency/job scheduling safe. New free jobs must not
enter charge/refund handling. Preserve compatibility for already billed jobs;
this does not revive subscriptions, old credit UI or broad resilience work.

Keep remains a historical paid-product direction in ADR-0010. It is not a
payment prerequisite for this free testing phase. A paid completion workflow
and a public-release spending policy need separate future decisions.

## Other owner directions recorded in the same reply

- Homepage clips: show none for now; curated public examples (#64) are deferred.
- Sora: OpenAI's [shutdown notice](https://developers.openai.com/api/docs/deprecations)
  says the video API and Sora 2 models became unavailable on 2026-09-24.
  Exclude new video dispatch, retain saved clips; OpenAI text calls are separate.
- Luma: the existing adapter submits Ray2 for the offered Ray3 model. Exclude
  that broken offer until a current API/credentials/capability migration passes.
- Kling: exclude it from the supported generation and live-quality matrix for
  this phase. Retained historical model ids and saved records may remain readable.
- Abandoned uploads: keep inspection read-only and automatic deletion off while
  the retention choice is deferred. The owner separately approved keeping saved
  projects until the creator explicitly deletes them. Preserve accepted copies and retry inputs.
- Provider testing: the owner narrowed acceptance at 14:43 CDT to one successful
  real completion per included provider. No quality scoring or human creative
  review is required for this phase. Existing offline request tests remain
  useful; they are not a reason to run paid variations.
- Current results: accepted provisionally for continuing functional work. This
  does not claim unperformed live creative reviews. The owner rejects the overall
  design; #65 remains open for design work and a fresh walkthrough.
- Reference before words and the standalone live editor continue under the
  recorded #119 decisions; no new session-launched editor surface is requested.

## Consequences and deferred work

#120's operating choice is settled. #124 can proceed without implementing #123.
#123 remains deferred rather than completed. #141/#143 test the free path;
#143's live spend must fit the shared $10 allowance. #144 needs one real successful completion per supported provider, with
usable output and recorded spend; its original creative-quality review is
superseded by the owner's narrower instruction. #145 uses existing
infrastructure; local checks are not a deployed rollback rehearsal.

Billing, creator spending caps, automatic file deletion, homepage clips and the
rejected overall design are recorded in the deferred-work ledger so they are not
lost or represented as finished.
