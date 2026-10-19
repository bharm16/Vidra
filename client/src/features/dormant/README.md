# Dormant capabilities

Kept on purpose, with no screen calling them since the `/session` workspace was retired (2026-10-19). Each one works against a live server endpoint and is ready to wire into `/app`. See CONTEXT.md › Dormant capabilities.

- `expand-idea/` — "Expand your idea": `PromptOptimizationApi` calls `POST /api/optimize` and `POST /api/optimize-compile`.
- `compare/` — `areGenerationsEqual`, the take comparison used for compare/diff.
- `camera-motion/` — `writeCameraDirection`, which writes a camera move into the words.
