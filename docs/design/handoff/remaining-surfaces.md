# Remaining surfaces — contents and function

Everything still un-specced, in the same format as the empty-state, toolbar, and navbar
docs. Contents and function only. Reflects ADR-0012: the page is the space + the docked
input + the next-step button; the player is the space's live node.

Already done: **empty state · toolbar · navbar**, and — from the empty-state design set —
**the settings surface · the auth dialog · the daily-cap moment · restored-draft-on-load**.

---

## The space

The content area of the page once work exists.

- **Within it:** nodes (one per take) in three fixed generations — words → pictures →
  clips; edges between them, typed by the verb that created them (roll · reword · move);
  the live node, enlarged, with the camera centered on it.
- **Function:** lays itself out — nodes are never dragged, wired, or placed. Grows a node
  whenever a generation starts (the node forms where it will permanently live, shows the
  waiting state, then fills with the result). Selecting a node slides the camera to it
  and puts its paired words in the input. A kept clip's node is marked. With no branches
  the space is a straight line; born with the first node at first submit, when the input
  docks.

## Loop moments (states of the space + input + button)

### Writing

- **Space** — the first words-node is forming; nothing else exists yet (or, mid-session,
  a new words-node buds from the current branch).
- **Input** — just docked; the one-liner grows into the full shot description in place. A
  "your words" control appears, holding the original one-liner and restoring it when
  activated.
- **Next step** — in progress; non-advancing.

### Painting

- **Space** — a picture-node forms off the words-node, showing the waiting state. Camera
  on it.
- **Input** — the full description, editable. Phrases are highlighted and open
  alternatives; the phrases that describe motion are shown distinct from the rest, marked
  as not part of the picture.
- **Next step** — in progress; non-advancing.

### Picture (the gate)

- **Space** — the picture-node is live: filled, enlarged, camera centered. Sibling
  pictures (earlier rolls) sit beside it; the words-version(s) behind it.
- **Input** — the description, phrases still open alternatives. Editing the words marks
  the live picture as no longer matching.
- **Next step** — advance to motion (a roll adds a sibling picture-node; a reword adds a
  words-node and its new picture).

### Moving

- **Space** — a clip-node forms off the approved picture, waiting state. Camera on it.
- **Input** — the description, editable; edits arm the next action.
- **Next step** — in progress; non-advancing.

### Clip

- **Space** — the clip-node is live: playing on its own, looping, muted. Sibling clips
  from earlier motion rolls sit beside it.
- **Input** — the description.
- **Next step** — keep (carries the subscription offer for non-subscribers); a motion
  re-roll adds a sibling clip-node.

### Kept

- **Space** — the kept clip's node is marked; camera on it.
- **Input** — the description.
- **Next step** — download; share; start a new clip.

---

## Shared components

### The input (beyond entry)

- Holds the one text: the one-liner, then the full description it becomes.
- **Within it:** the text; highlighted phrases (activating one opens alternatives); the
  "your words" control; motion phrases shown as distinct and marked as not in the
  picture.
- **Function:** docked from first submit onward; editable in every moment; its content at
  the moment of any generation is exactly what is sent; editing after a picture exists
  marks that picture stale. Selecting a node replaces its content with that node's
  paired words.

### Nodes

- **A words-node:** the description text, as a card.
- **A picture-node:** the still.
- **A clip-node:** the clip; plays when live.
- **Every node:** its state (forming · ready · kept · stale), and its paired words
  retrievable by selecting it.

### The phrase-alternatives surface

- Opens from an activated phrase in the input.
- **Within it:** a few alternative phrasings for that phrase; the option to type your own.
- **Function:** choosing one replaces that phrase in the description. Phrases describing
  camera or subject motion offer motion-vocabulary alternatives.

---

## Failure conditions

### Writing failed

- No node results. Input returns to the one-liner, unchanged. A line states it failed.
  Next step returns to submit.

### Picture failed

- The forming node reports the failure at the live position; no node persists. The
  description is kept. A line states it failed and that nothing was charged. Next step is
  retry.

### Motion failed

- Same as picture failed: the picture is kept, a line states it failed and that nothing
  was charged, next step is to move again.

### Render (keep) failed

- A line states the keep failed and that nothing was charged. Next step is to keep again.

---

## Pages

### Library

- A list of past sessions and kept clips.
- **Each entry:** title, a picture or clip, timestamp.
- **Function:** activating an entry opens that session's space at its live node; the list
  is searchable and filterable.

### Account

- **Within it:** name, email, subscription status; actions to manage the subscription,
  open the library, and sign out.

### Public clip page

- One kept clip, viewable without signing in.
- **Within it:** the clip player, its description, and an action to start your own clip.

### Docs

- Explanation of the workflow (type → picture → motion → keep), how editing phrases
  works, and what the space shows. Content only.
