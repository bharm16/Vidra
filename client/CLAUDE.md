# Client

Follow [../CLAUDE.md](../CLAUDE.md). React 18, Vite, TypeScript, Tailwind and `@promptstudio/system`.

- Separate presentation from behavior using the `features/studio/` orchestrator/hooks/api/components pattern.
- Use reducers for complex state, feature-local display types and validated feature `api/` boundaries.
- Use shared design-system primitives and semantic tokens; type icons as `IconProps["icon"]`.
- Preserve working words/settings when inspecting results. **Reuse setup** is explicit restoration.
- Read [Page 21 adoption](../docs/design/page21-component-migration.md) for visual changes; verify real state journeys and accessibility.
- A shadcn Button's `h-9` requires `!h-auto` when overriding height; verify in the browser.

Targeted tests: `npx vitest run <path> --config config/test/vitest.unit.config.js`.
