---
description: "Use when writing, modifying, or debugging tests. Covers test conventions, structure, and the vitest setup for this project."
applyTo: "tests/**"
---

# Testing Conventions

## Framework

- vitest v2.x (pinned for Node 18 compatibility)
- Run: `npx vitest run --reporter=verbose`
- Watch: `npx vitest --reporter=verbose`
- Config: `vitest.config.ts` at root

## Test Structure

Tests mirror the src/ structure:
- `tests/runtime/` — MaybeNumeric, ParseResult, ParseError
- `tests/reader/` — ABNF parsing via the `abnf` npm package
- `tests/analyzer/` — dependency graph, pattern detection, type categories
- `tests/codegen/` — generated code structure and content assertions
- `tests/e2e/` — full pipeline: .abnf → analyze → generate → verify output

## Key Test Patterns

### Round-trip tests
The most important tests assert `build(parse(input)) === input`. Always include these when adding new rule support.

### Snapshot-style assertions
Codegen tests assert on generated code content (e.g. `expect(file.content).toContain('ClassName')`) rather than snapshot files. This makes the tests resilient to formatting changes.

### Core rules as integration fixture
`grammars/core.abnf` (16 rules) serves as the integration test fixture. Tests verify it parses, analyzes, and generates without errors.

### SIP-like grammar tests
E2E tests include a SIP-like ABNF grammar (Method, Max-Forwards, etc.) to test realistic patterns.

## Don'ts

- Don't use `rm -rf` to clean test output — use unique timestamped dirs if needed
- Don't write to `/tmp` — use workspace-local paths
- Don't upgrade vitest past v2.x (Node 18 incompatibility)
- Don't skip the round-trip invariant test when adding new features
