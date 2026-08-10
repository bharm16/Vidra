---
tags: [vault, index]
---

# Vidra Vault Index

The hand-written half of the `docs/` vault. Notes here are **synthesis** — things true across several files that no single file says. Everything else already has a home, and duplicating it here just creates a second copy that drifts.

## What goes where

| Kind of knowledge             | Home                                                               | Why                                                          |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Term meanings                 | `CONTEXT.md` + the CLAUDE.md Domain Glossary                       | Single source; the glossary explicitly forbids a second copy |
| A decision and its trade-offs | [[adr/0002-vidra-is-an-authoring-tool-for-non-experts\|docs/adr/]] | ADRs are never deleted; they are the decision record         |
| Service wiring, routes, flags | [[graph/Home\|graph/]]                                             | Generated from the architecture map                          |
| A point-in-time review        | [[audits/2026-08-09-deep-module-audit\|docs/audits/]]              | Dated snapshots, not live state                              |
| **Cross-cutting synthesis**   | **here**                                                           | Spans all of the above                                       |

## Notes

- [[The Adoption Problem]] — the shape most of this codebase's debt actually takes
- [[Frozen Stacks]] — what ADR-0002 froze, and the three places it leaks anyway
- [[The Verification Oracle]] — what the gates prove, and the four things they cannot see
- [[Browsing Versus Restoring]] — an unresolved contradiction between the UX rules and three ADRs

## Two rules about this vault

**`graph/` is generated and destroyed.** `scripts/generate-obsidian-vault.ts` runs `rmSync(graph/, {recursive, force})` on every pre-commit, and `graph/` is gitignored. A note written there is gone at the next commit with no git history to recover it. Write here instead; link into `graph/` freely.

**Link by vault-relative path with an alias**, matching the generated notes: `[[graph/services/aiService|aiService]]`. Files above `docs/` — `CLAUDE.md`, `CONTEXT.md`, `scripts/`, `client/`, `server/` — are outside the vault and cannot be wikilinked. Cite those as plain paths.

Regenerate the graph half with:

```bash
npm run architecture:map:write && npm run obsidian:vault
```
