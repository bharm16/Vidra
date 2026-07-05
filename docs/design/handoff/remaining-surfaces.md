# Remaining surfaces — contents and function

Everything still un-specced, in the same format as the empty-state, toolbar, and navbar
docs. Contents and function only.

Already done: **empty state · toolbar · navbar**.

---

## Loop moments

Each moment is a configuration of the player, the input, and the next step (the button
per moment is in the toolbar doc).

### Writing

- **Player** — waiting state; it has just appeared.
- **Input** — the one-liner grows into the full shot description in place. A "your words"
  control appears, holding the original one-liner and restoring it when activated.
- **Next step** — in progress; non-advancing.

### Painting

- **Player** — waiting state; the picture is being made. Starts on its own after writing.
- **Input** — the full description, editable. Phrases are highlighted and open
  alternatives (see phrase-alternatives). The phrases that describe motion are shown
  distinct from the rest, marked as not part of the picture.
- **Next step** — in progress; non-advancing.

### Picture (the gate)

- **Player** — the still. The takes strip is present once more than one take exists.
- **Input** — the description, phrases still open alternatives. Editing the words marks the
  picture as no longer matching.
- **Next step** — advance to motion; re-roll the picture from the same words; or, if the
  words were edited, remake the picture.

### Moving

- **Player** — the approved still under a progress indication.
- **Input** — the description, editable; edits arm the next action.
- **Next step** — in progress; non-advancing.

### Clip

- **Player** — the clip, playing on its own, looping, muted. Takes strip present.
- **Input** — the description.
- **Next step** — keep (carries the subscription offer for non-subscribers); or re-roll
  the motion.

### Kept

- **Player** — the kept clip.
- **Input** — the description.
- **Next step** — download; share; start a new clip.

---

## Shared components (span the loop)

### The input (beyond entry)

- Holds the one text: the one-liner, then the full description it becomes.
- **Within it:** the text; highlighted phrases (activating one opens alternatives); the
  "your words" control (holds the original one-liner, restores it); motion phrases shown
  as distinct from the rest and marked as not in the picture.
- **Function:** editable in every moment; its content at the moment of any generation is
  exactly what is sent; editing after a picture exists marks that picture stale.

### The player

- One rectangle; the single place any result appears.
- **Shows, in sequence:** a waiting state; the still picture; the still under a progress
  indication; the clip (playing, looping, muted).
- Absent before the first submission.

### The takes strip

- A row of prior takes for the current work.
- **Each take:** a prior picture or clip, paired with the words that produced it.
- **Function:** activating a take browses it read-only — the player shows it and the input
  shows its words, both non-editable; a restore action loads that take's media and words
  together into the live work.

### The phrase-alternatives surface

- Opens from an activated phrase in the input.
- **Within it:** a few alternative phrasings for that phrase; the option to type your own.
- **Function:** choosing one replaces that phrase in the description. Phrases describing
  camera or subject motion offer motion-vocabulary alternatives.

---

## Summoned surfaces

### Settings surface

- **Within it:** two controls — aspect ratio and clip duration.
- **Function:** options constrained to allowed values; commit immediately; persist.

### Auth dialog

- **Within it:** Google sign-in; email + password; a switch to account creation; inline
  error; dismiss.
- **Function:** opens when a signed-out user submits, or from the nav's sign-in. The draft
  is held behind it; on success a pending submission continues, otherwise it closes.

---

## Failure conditions

### Writing failed

- Input returns to the one-liner, unchanged. A line states it failed. Next step returns to
  submit.

### Picture failed

- The description is kept. A line states it failed and that nothing was charged. Next step
  is retry.

### Motion failed

- The picture is kept. A line states it failed and that nothing was charged. Next step is
  to move again.

### Render (keep) failed

- A line states the keep failed and that nothing was charged. Next step is to keep again.

### Daily cap reached

- Current work stays. A line states the free limit is reached and the work is saved. The
  generation action is unavailable; a subscribe action is offered.

---

## Pages

### Library

- A list of past sessions and kept clips.
- **Each entry:** title, a picture or clip, timestamp.
- **Function:** activating an entry opens that session at its current point; the list is
  searchable and filterable.

### Account

- **Within it:** name, email, subscription status; actions to manage the subscription,
  open the library, and sign out.

### Public clip page

- One kept clip, viewable without signing in.
- **Within it:** the clip player, its description, and an action to start your own clip.

### Docs

- Explanation of the workflow (type → picture → motion → keep) and how editing phrases
  works. Content only.
