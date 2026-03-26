---
description: "Use when modifying runtime primitives (MaybeNumeric, ParseResult, ParseError). These types are used by all generated code and must maintain backward compatibility."
applyTo: "src/runtime/**"
---

# Runtime Primitives

The runtime module is a small library shipped alongside generated code. Generated parsers/builders import from it. Changes here affect ALL generated code.

## MaybeNumeric

Wraps a raw string that may represent a numeric value.

- `readonly raw: string` — always the original text, never modified
- `toString(): string` — returns `raw` (for reversibility)
- `asNumber(): number` — interprets as float, throws `NumericConversionError` if empty, NaN, or Infinity
- `asInteger(): number` — interprets as integer, throws if not integral or exceeds `Number.MAX_SAFE_INTEGER`

**Key constraint**: MaybeNumeric NEVER mutates or normalizes the raw string. `"007"` stays `"007"`. `" 5 "` stays `" 5 "`. The consuming layer (e.g. SIP parser) decides how to handle formatting.

## ParseResult<T>

Discriminated union:
- `ParseSuccess<T>` — `{ success: true, value: T, nextOffset: number }`
- `ParseFailure` — `{ success: false, error: ParseError }`

Helper factories: `success(value, nextOffset)` and `failure(rule, offset, expected, actual, children?)`.

## ParseError

Stores `rule`, `offset`, `expected`, `actual`, and `children: ParseError[]` (for nested alternation errors). The `toString()` method formats a human-readable error tree.

## Compatibility

These types are the public API contract with generated code. Breaking changes here require updating all generated code. Add new methods/properties conservatively.
