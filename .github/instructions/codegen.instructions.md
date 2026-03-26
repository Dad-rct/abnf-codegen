---
description: "Use when modifying or creating ABNF codegen emitters, AST analysis, or generated code shapes. Covers the type-emitter, parser-emitter, builder-emitter, and codegen orchestrator."
applyTo: "src/codegen/**"
---

# Codegen Design Rules

## Generated Code Shape

Each ABNF rule produces three exports:
- `___Node` — class with `readonly raw: string`, lazy getters for sub-rules, `toString()` returning raw
- `___Parser` — class with static `parse(input: string, offset?: number): ParseResult<___Node>`
- `___Builder` — class with static `build(value: ___Node | { raw: string } | string): string`

## Two-Tier Parsing

- **Tier 1 (eager)**: The `parse()` method scans the full structure, validates format, and captures start/end offsets for each sub-rule. Returns a Node with `.raw` populated.
- **Tier 2 (lazy)**: Node properties for sub-rules are getters. On first access, the getter parses the sub-rule from the stored offsets. If never accessed, never parsed.

Do NOT make lazy fields eager. The performance benefit for SIP (parsing full messages but only inspecting a few headers) depends on this.

## Naming Conventions

- `toPascalCase(ruleName)` for class names: `sent-protocol` → `SentProtocol`
- `toCamelCase(ruleName)` for property/field names: `sent-protocol` → `sentProtocol`
- Filenames: lowercase, hyphens: `sent-protocol.ts`

## MaybeNumeric Fields

When the pattern detector identifies a digit sequence (1*DIGIT, DIGIT, etc.), the codegen emits `MaybeNumeric` instead of `string`. The lazy init creates `new MaybeNumeric(this.raw.substring(start, end))`.

## Alternation Codegen

Alternations use a try-each strategy with error collection. Each alternative is tried in order; on failure its `ParseError` is collected. If all fail, a combined error with child errors is returned.

## Imports

Each generated rule file imports:
- `ParseResult`, `ParseError`, `success`, `failure` from the runtime
- `MaybeNumeric` from the runtime (if the rule or its references involve numeric patterns)
- Referenced rule Node/Parser classes from sibling files
