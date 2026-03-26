---
description: "Use when modifying the ABNF reader, AST types, or analyzer (dependency graph, pattern detection). Covers the interface between the abnf npm package and our internal IR."
applyTo: ["src/reader/**", "src/analyzer/**", "grammars/**"]
---

# Reader & Analyzer Design

## Reader

The reader wraps the `abnf` npm package (v5.x, Apache-2.0, no TypeScript types).

- `readString(input, source?)` — parse ABNF text, returns `Rules` AST
- `readFile(filePath)` — parse .abnf file, returns `Rules` AST
- `validateRefs(rules)` — returns `null` if all references resolve, else error strings

Our TypeScript types for the AST live in `src/reader/types.ts`. These mirror the runtime classes from `abnf/lib/ast.js`. Notable quirks:
- `CaseInsensitiveString` type is `'caseInsensitveString'` (typo in the abnf package, missing 'i')
- `CaseSensitiveString` type is `'caseSensitveString'` (same typo)
- Rule names in `Rules.defs` are keyed by UPPERCASE name, but `Rule.name` preserves original case

## Core Rules

`grammars/core.abnf` defines the 16 RFC 5234 Appendix B core rules. Comments must use ASCII only (no em-dashes, curly quotes, etc. — the ABNF parser rejects non-ASCII in comments).

## Analyzer

### Dependency Graph
- Tarjan's SCC algorithm for cycle detection and topological sorting
- SCCs come out of Tarjan's in correct topological order (dependencies first) — do NOT reverse
- Cycles are SCCs with >1 member, or a single node referencing itself
- Cyclic rules get `isCyclic: true` → codegen uses lazy getter patterns

### Pattern Detector
Recognizes digit-sequence patterns → marks as `MaybeNumeric`:
- `1*DIGIT`, `*DIGIT`, `1*3DIGIT` — integer-like
- `1*DIGIT "." 1*DIGIT` — decimal-like  
- `DIGIT` (bare reference) — single digit

Recognizes literal alternation patterns → marks as `LiteralPattern`:
- `"INVITE"` — single case-insensitive literal
- `"INVITE" / "ACK" / "BYE"` — alternation of case-insensitive literals
- All alternatives must be string literals with uniform case sensitivity
- Canonical forms are uppercase for case-insensitive, original for case-sensitive
- Mixed case-sensitivity alternations are not detected

### Type Categories
Each rule gets a `typeCategory` that drives codegen decisions: `literal`, `alternation`, `concatenation`, `repetition`, `numeric`, `range`, `reference`, `group`, `prose`.
