# Empty state

The first screen. A creator types a few words and starts.

## Contains

- **Input** — single multiline text entry, the only text surface. Holds the typed words,
  persists them as a draft across reload, and is the exact text submitted. Enables the
  submit action when it has non-whitespace content.
- **Submit action** — snapshots the input, signs the user in if needed, checks the daily
  cap, then dispatches. Disabled while the input is empty.
- **Starter examples** — a small set of preset ideas; activating one fills the input.
  Does not submit.
- **Settings** — two inline selectors on the input: aspect ratio and clip duration.
- **Auth dialog** — Google sign-in, email + password, a switch to account creation, error
  text, dismiss. Opens when a signed-out user submits; the draft stays behind it and the
  submit continues after sign-in.
- **Navbar** — specified separately.
