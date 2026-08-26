# Architecture Documentation

This directory contains the architectural standards and patterns for the Prompt Builder codebase.

## Files

### 📋 REFACTORING_STANDARD.md

**The Policy Document**

- Defines when and why to refactor
- Specifies file size limits (500 lines for files, 200 for components)
- Documents both frontend and backend patterns
- Required reading for all contributors

### 🔧 REFACTORING_PATTERN.md

**The How-To Guide**

- Step-by-step refactoring checklist
- Shows the standard directory structure
- Includes template for Claude Code requests

### 🤖 CLAUDE_CODE_RULES.md

**AI Assistant Instructions**

- Rules for Claude Code when implementing features
- Architecture patterns to follow
- File size limits by file type
- Pre-implementation checks

### SERVICE_BOUNDARIES.md

**Service Ownership Map**

- Clarifies span labeling, semantic parsing, and video prompt analysis responsibilities
- Avoids overlapping pipelines and duplicate LLM calls

### TypeScript

Project-specific TypeScript references: [logging patterns](./typescript/LOGGING_PATTERNS.md) and the [test writing guide](./typescript/TEST_GUIDE.md). General TS/Zod conventions live in the root `CLAUDE.md`.

## Quick Start

**Refactoring a large component?**
→ Read `REFACTORING_PATTERN.md` and follow the checklist

**Reviewing a PR?**
→ Check against `REFACTORING_STANDARD.md` requirements

**Onboarding a new developer?**
→ Start with `REFACTORING_STANDARD.md`

## Examples

Successful refactorings following these patterns:

- `server/src/services/prompt-optimization/` (Backend)
