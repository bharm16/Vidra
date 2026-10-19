# Fresh workspace runtime QA inventory

This is an implementation checkpoint, not a claim of complete redesign acceptance.

| Control or behavior | Functional check | Visual state / evidence |
| --- | --- | --- |
| Project create / reopen | stable identity, actual server creation, reload | desktop project index and new request |
| New image / video draft | explicit action, retain previous words | empty and populated composer |
| Draft edits / save / undo / redo | exact words on reload; stale acknowledgment guard; scoped undo | saved / device saved / failed |
| Model selection / review | exact profile and values; unqualified action blocks dispatch | model control, blockers |
| Request history | failed read shown; immutable accepted records | failed / waiting / result cards |
| Projects, Help, Account navigation | retained copy or save before leaving | leave dialog |
| Project media / use input / reuse | inspection does not author; explicit exact-version change | viewer and input dialog |
| Video play, seek, mute, volume, fullscreen | native file playback and local control state | selected clip |
| Phrase replacements, custom suggestion, stale review | exact UTF16 binding, keyboard, retains failed custom words | phrase panel |
| Mobile pane switch | draft and viewer retained through full toggle cycle | 390px / 320px |

Off-path checks: failed history load with retained words; older save completion while newer words are present; two offline tabs retaining distinct drafts; unknown request acceptance checked with its original identity. Browser API checks run through real HTTP intake and real emulator persistence. Provider quality and external handoffs remain separate gates.
