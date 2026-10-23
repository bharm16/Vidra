# Deep modules

Each immediate child of `packages/` is one package. Copy or delete `example/` as a starter template; packages stay flat, while implementation may nest freely.

```text
packages/
  <name>/
    index.ts        # Public entry point
    client.ts       # Another small entry point, when needed
    lib/            # Private implementation
      impl.ts
    tests/          # Private tests and fixtures
      example.test.ts
```

**Entry-point interface.** Import only through a package's entry points (its root files). Every subfolder is private, regardless of its name or depth. Expose several small entry points instead of a barrel file that re-exports a whole subtree. The existing `promptstudio-system/src/` implementation follows the same privacy rule; its named root entry points and `package.json` exports expose its interface.

**Intra-package freedom.** A package's implementation and entry points may import their own internals freely. Reach another package only through its root entry points. The `tests/` folder is accessible only to that package's own tests.

**Tests through entry points.** Files under `<name>/tests/` exercise behavior through root entry points, including other packages' entry points for integration tests. They may import their own `tests/` fixtures, but never implementation in any package's subfolders, including their own.

**No cycles.** Dependency cycles are errors. Run `npm run lint:boundaries` to check packages and their callers, including type-only imports. `npm run verify` and CI run this alongside typecheck, lint and unit tests. Layering between packages is a separate concern; add project-specific rules at the commented stub in `.dependency-cruiser.cjs` when needed.
