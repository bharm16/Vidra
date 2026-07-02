# Prompt Builder Refactoring Standard

## Core Principle

> **"How many reasons does this have to change?"**

If 1 → don't split.
If 2+ → split by responsibility.

---

## Before Refactoring Anything

Answer these:

1. **Can I describe this file in one sentence without "and"?**
   - Yes → Don't split
   - No → Identify the distinct responsibilities

2. **Can I test this with ≤2 mocks?**
   - Yes → Coupling is fine
   - No → Extract what you're mocking

3. **If I change X, does only X's file change?**
   - Yes → Boundaries are good
   - No → Consolidate or clarify boundaries

---

## When to Refactor

**Split when:**

- File has multiple distinct responsibilities
- Different parts have different reasons to change
- You want to test parts independently
- Parts could be reused elsewhere

**Don't split when:**

- File has one responsibility (even if it's long)
- Pieces always change together
- Pieces only make sense together
- You're just hitting some arbitrary threshold

---

## Component Structure Pattern

When a component has **multiple distinct responsibilities**, refactor to:

```
ComponentName/
├── ComponentName.jsx     → Orchestration: wires pieces, no business logic
├── hooks/                → State + handlers: testable without rendering
├── api/                  → Fetch + parsing: one place for endpoint changes
├── utils/                → Pure transforms: no dependencies
├── config/               → Constants: change without touching logic
└── components/           → Display: props in, JSX out (only if reused)
```

**Test:** Can you describe each file in one sentence without "and"?

---

## Service Structure Pattern

When a service has **multiple distinct responsibilities**, refactor to:

```
ServiceName/
├── ServiceName.js        → Coordination: delegates, doesn't implement
├── services/             → One responsibility per file
├── repositories/         → Data access abstraction
└── templates/            → External prompts (.md files)
```

**Test:** Can you test each service with ≤2 mocks?

---

## Code Review Checklist

Before merging:

- [ ] Each file describable in ≤10 words
- [ ] Each file testable with ≤2 mocks
- [ ] Files that change together live together
- [ ] No business logic in orchestrators
- [ ] API calls in api/ layer
- [ ] No artificial splits (pieces that always change together)

### ❌ Reject If:

- Split because "it was too long" (not a valid reason)
- Component created that's used in exactly one place
- Code extracted that always changes with its caller
- Indirection added without improving testability

### ✅ Approve If:

- Split separates distinct responsibilities
- Each piece has one reason to change
- Each piece is independently testable
- Cohesion is improved (not just size reduced)

---

## Refactoring Action Checklist

When a component or service has MULTIPLE RESPONSIBILITIES, work through these in order:

1. [ ] Identify distinct responsibilities (list them)
2. [ ] Create one location per responsibility
3. [ ] Extract API calls → api/
4. [ ] Extract state logic → hooks/ (useReducer for complex state)
5. [ ] Extract pure transforms → utils/
6. [ ] Extract constants → config/
7. [ ] Extract reusable display → components/ (only if reused)
8. [ ] Main file becomes orchestration only
9. [ ] Each piece testable with ≤2 mocks
10. [ ] Capture the resulting pattern in `docs/archive/refactoring/`

---

## Claude Code Refactoring Request Template

```
Refactor [Component]

PROBLEM: [describe actual issue — multiple responsibilities, hard to test, etc.]
NOT: "it's too long"

RESPONSIBILITY ANALYSIS:
1. [Responsibility A] → will become hooks/useX.ts
2. [Responsibility B] → will become api/xApi.ts
3. [Responsibility C] → will become utils/xUtils.ts

VALIDATION:
- Each file describable in ≤10 words
- Each file testable with ≤2 mocks
- Main file has no business logic

SHOW PLAN FIRST
```
