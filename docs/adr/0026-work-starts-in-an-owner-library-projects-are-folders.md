# Work starts in an owner library; projects are folders

**Status:** Accepted and implemented — 2026-10-19. The owner rejected requiring a project before creating anything and chose optional projects that work can be added to later. They also chose to let signed-out visitors write a request before signing in. This settles the project storage question that ADR-0024 left open.

Every workflow record lived under `creation_projects/{projectId}`, and `projectId` was part of draft destinations, accepted requests, idempotency hashes, upload paths and every ownership check. `/app` therefore opened a project list, and a first-time creator had to name a project before writing anything.

## Decision

- **Each owner has one library.** It is an ordinary `creation_projects` record marked `role: "library"`, with a server-derived id (`project_library_` + a sha256 digest of the owner id). `POST /api/projects/library` creates it on first use; clients cannot create that id prefix. The library is hidden from the project list and cannot be renamed or trashed. Work that starts outside a named project lives there. Every existing guard, receipt, hash and recovery path applies unchanged.
- **A new project is a folder.** `creation_folders/{folderId}` holds an owner, name, revision and status. A library conversation carries an optional `folderId`; filing and unfiling are revision-checked label changes on the conversation. Requests, media and drafts never move. The server accepts a folder only for library conversations, and only when the folder is the caller's and active.
- **Earlier projects keep their own history.** They stay listed beside folders and open at `/app/project/:id`. Nothing is migrated.
- **Signed-out visitors write first.** The model list is public (`/api/public/workflow/profiles`). A signed-out draft holds only words, action and settings in this browser's storage for a day. Making something, phrase help, references and Sketch ask for an account. After sign-in, a matching claim moves the draft into a new library conversation through idempotent creates. It is never submitted automatically: dispatch snapshots a destination that did not exist before sign-in, and provider spend needs an explicit press.

## Considered alternatives

- **Remove `projectId` from every record.** This rewrites schemas, idempotency hashes, storage paths, every guard and about forty routes, and still needs a migration. The library gives the same experience without touching any of them.
- **Move conversations between projects.** Accepted requests are immutable (ADR-0025) and their project is part of the receipt hash and destination checks, so moving them would break their identity.
- **Make folders a kind of project document.** Every project guard would then need to exclude them.
- **Auto-create an untitled project on first make.** The owner rejected a visible project appearing without being asked for.
- **Firebase anonymous accounts for signed-out writing.** These would create server records and an identity that could spend before the visitor chose to sign up.

## Consequences

- Library conversation listing reads newest first so the 200-row cap never drops recent work.
- Media and video edits stay library-wide; a folder groups conversations only. Media records reach a conversation only through their request, and edits, imports and exports have no conversation, so filing them would be a separate additive change.
- Because the library cannot be trashed, its shares are revoked one at a time; the trash-wide sharing epoch never applies to it.
- The successful-project-creation entry ticket (`created`, the N38 presentation) no longer has a producer: creating a project opens that project's home rather than an empty workspace.
