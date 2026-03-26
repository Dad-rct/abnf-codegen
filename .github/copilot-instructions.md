# abnf-codegen — Workspace Instructions

## Project Overview

This is an ABNF (RFC 5234) code generator that reads `.abnf` grammar files and produces TypeScript parser/builder classes. It will be consumed by a downstream SIP parser (RFC 3261).

## Critical Design Invariants

These invariants MUST be preserved in all changes:

1. **Reversibility**: `build(parse(input)) === input`. Every parsed node stores `.raw` (the original matched text). Building from a parsed object always reproduces the exact original, including whitespace, casing, and formatting.

2. **Two-tier lazy parsing**: Tier 1 (eager) scans structure and captures raw text spans + offsets. Tier 2 (lazy) parses sub-rules on first property access via getters. Never make Tier 2 parsing eager — SIP consumers only inspect a few headers per message.

3. **MaybeNumeric, not Number**: Digit sequences (`1*DIGIT`, `1*3DIGIT`, `DIGIT "." DIGIT`) are wrapped in `MaybeNumeric`, never coerced to `number` at the ABNF layer. The consuming protocol layer decides via `.asNumber()` or `.asInteger()`.

4. **Core rules are data, not code**: The 16 RFC 5234 core rules live in `grammars/core.abnf` and go through the same reader → analyzer → codegen pipeline as user rules. No special-cased primitives.

## Architecture

The pipeline is: `.abnf files` → Reader (wraps `abnf` npm pkg) → AST → Analyzer (dependency graph, pattern detection) → IR → Codegen → TypeScript classes.

Generated code shape per rule:
- `___Node` class — holds `.raw` + lazy getters for sub-rules
- `___Parser` class — static `parse(input, offset?)` returning `ParseResult<___Node>`
- `___Builder` class — static `build(value)` accepting Node or raw string
- `Grammar` facade — composes all rules as properties

## Conventions

- Node 18 target. All deps must be compatible with Node 18.
- `@types/node@18` — pinned to match runtime target.
- `vitest` v2.x for tests. Use `--reporter=verbose`.
- TypeScript strict mode, ES2022 target, Node16 module resolution.
- The `abnf` npm package has no TypeScript types — our types are in `src/reader/types.ts`.

## Build & Test

```bash
npm install           # install dependencies
npx vitest run --reporter=verbose  # run all tests
npx tsc --noEmit      # type-check
npx tsx src/cli.ts grammars/core.abnf -o src/generated  # generate code
```

## Don'ts

- Don't coerce MaybeNumeric to number in generated code
- Don't normalize whitespace or casing in parsed nodes
- Don't make sub-rule parsing eager
- Don't add core rules as hardcoded TypeScript — use the .abnf file
- Don't use `rm -rf` on test output directories
- Don't use vitest v3+ or v4+ (incompatible with Node 18)
