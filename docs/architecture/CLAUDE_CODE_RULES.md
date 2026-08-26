# Rules for Claude Code

## The Only Question That Matters

> **"How many reasons does this have to change?"**

If the answer is 1, don't touch it. If the answer is 2+, split by responsibility.

---

## Before Writing Code

### 1. Responsibility Check

Ask: _"Can I describe what this does in one sentence without using 'and'?"_

- ✅ "Manages wizard step navigation"
- ❌ "Manages wizard steps and validates form input and calls the API"

If you need "and," you have multiple responsibilities. Split them.

### 2. Testability Check

Ask: _"Can I test this by mocking ≤2 dependencies?"_

If you need to mock 5 things to test one function, that function knows too much. Extract what it's reaching into.

### 3. Change Coupling Check

Ask: _"When I change X, what else breaks?"_

If changing the API response format requires touching 6 files, you have a coupling problem. The parser should live in one place.

---

## Where Things Go

| Thing             | Location                                     | Why                                       |
| ----------------- | -------------------------------------------- | ----------------------------------------- |
| HTTP calls        | `api/` layer                                 | One place to change when endpoints change |
| State logic       | `hooks/` (useReducer)                        | Testable without rendering                |
| Business rules    | `services/` (backend) or `hooks/` (frontend) | Isolate from UI concerns                  |
| Pure transforms   | `utils/`                                     | No dependencies, easy to test             |
| Display decisions | Components                                   | Keep rendering concerns together          |
| Configuration     | `config/`                                    | Change without touching logic             |

**The test:** If you're importing something from a different layer to make a change, the responsibility is in the wrong place.

---

## Patterns

### Frontend: Feature-Slice Pattern

```
ComponentName/
├── ComponentName.jsx    → Orchestration: wires pieces together, no logic
├── hooks/               → State: all useReducer, derived state, handlers
├── api/                 → Network: fetch wrappers, response parsing
├── components/          → Display: receives props, renders UI
├── utils/               → Transforms: pure functions, no side effects
└── config/              → Data: constants, defaults, options
```

**Orchestrator test:** If `ComponentName.jsx` has an `if` statement with business logic, extract it.

### Backend: PromptOptimizationService Pattern

```
ServiceName/
├── ServiceName.js       → Orchestration: coordinates specialized services
├── services/            → Logic: each service = one responsibility
├── repositories/        → Data: database/API access
└── templates/           → Prompts: external .md files
```

**Orchestrator test:** If the main service file has more than coordination logic, extract a specialized service.

---

## When to Split

Split when you can answer YES to any of these:

1. **Different stakeholders care about different parts**
   - Designer changes styles, backend dev changes data fetching → separate
2. **Different triggers cause changes**
   - API contract change vs. UI redesign → separate
3. **You want to test parts independently**
   - Validation logic vs. form rendering → separate

4. **Parts could be reused elsewhere**
   - Date formatting used in 3 components → extract to utils

## When NOT to Split

Don't split when:

1. **The pieces always change together**
   - Splitting creates "shotgun surgery" (one change, many files)

2. **The pieces only make sense together**
   - A modal and its content that's never reused

3. **You're hitting some arbitrary line count**
   - A 600-line state machine with one responsibility is fine

4. **You're adding indirection without benefit**
   - A wrapper function that just calls another function

---

## Code Smells to Watch For

| Smell                      | Symptom                                                  | Fix                            |
| -------------------------- | -------------------------------------------------------- | ------------------------------ |
| **Feature Envy**           | Function uses more data from another module than its own | Move it to that module         |
| **Shotgun Surgery**        | One conceptual change requires editing 5+ files          | Consolidate the responsibility |
| **God Object**             | One file that everything depends on                      | Split by responsibility        |
| **Primitive Obsession**    | Passing 5 related strings instead of an object           | Create a type/object           |
| **Inappropriate Intimacy** | Module reaches into another's internals                  | Define a proper interface      |

---

## Validation Questions

After any change, ask:

1. **Can I explain what each file does in ≤10 words?**
2. **Do the files that change together live together?**
3. **Can I test each piece with minimal mocking?**
4. **If I delete this file, does exactly one capability disappear?**

If any answer is "no," you have a cohesion problem—not a line count problem.

---

## Reference Implementations

- **Frontend:** `client/src/features/studio/`
- **Backend:** `server/src/services/prompt-optimization/`

Read these to understand the _why_, not just the structure.
