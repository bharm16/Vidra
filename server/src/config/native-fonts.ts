// Core Text does not discover Sharp's private fontfile on macOS. Select the
// Fontconfig backend once at startup, before a native service initializes Pango.
// server/index.ts loads dotenv first so an operator's .env choice is already available.
if (process.platform === "darwin" && process.env.PANGOCAIRO_BACKEND === undefined) {
  process.env.PANGOCAIRO_BACKEND = "fontconfig";
}

export {};
