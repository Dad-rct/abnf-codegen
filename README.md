# abnf-codegen

Type-safe ABNF (RFC 5234) parser/builder code generator for TypeScript.

Reads `.abnf` grammar files and generates per-rule TypeScript parser/builder classes with full type safety, raw-text preservation for reversible parse/build round-trips, and lazy sub-rule parsing for performance.

Built to power a SIP (RFC 3261) parser, but applicable to any ABNF-based protocol.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npx vitest run --reporter=verbose

# Type-check
npx tsc --noEmit

# Generate code from ABNF grammar
npx tsx src/cli.ts grammars/core.abnf -o src/generated
```

## Usage

### CLI

```bash
# Single file
abnf-codegen grammars/sip.abnf -o src/generated

# Multiple files (rules are merged, first file takes precedence for duplicates)
abnf-codegen grammars/core.abnf grammars/sip.abnf -o src/generated

# Explicit flags
abnf-codegen -i grammars/core.abnf -i grammars/sip.abnf -o src/generated

# Custom runtime import path (for consuming repos)
abnf-codegen grammars/sip.abnf -o src/generated -r @pebbletree/abnf-codegen/runtime
```

### Programmatic API

```typescript
import { readFile, analyze, generate } from '@pebbletree/abnf-codegen';

const rules = readFile('grammars/sip.abnf');
const analyzed = analyze(rules);
const files = generate(analyzed);
// files is an array of { filename, content } objects

// With custom runtime import path for generated code:
const files = generate(analyzed, {
  runtimeImport: '@pebbletree/abnf-codegen/runtime'
});
```

### Runtime Subpath Export

Consuming repos can import runtime types directly without depending on the full codegen package:

```typescript
import { MaybeNumeric, ParseResult, success, failure } from '@pebbletree/abnf-codegen/runtime';
```

Use `--runtime-import` / `-r` CLI flag (or `runtimeImport` option in `generate()`) to configure generated code to import from this subpath instead of a relative path.

### Generated Code

For each ABNF rule, the generator produces:

```typescript
// Per-rule node class (holds parsed data with raw-text preservation)
const result = MethodParser.parse('INVITE');
if (result.success) {
  result.value.raw;       // "INVITE" — original text, always available
  result.value.toString(); // "INVITE" — same as .raw
}

// Per-rule builder (reconstructs string from parsed object)
MethodBuilder.build(result.value); // "INVITE"
MethodBuilder.build('INVITE');     // "INVITE" (accepts raw strings too)

// Facade class composing all rules
const grammar = new Grammar();
grammar.method.parse('INVITE');
grammar.method.build(parsedValue);
```

## Design Considerations

### Reversibility Invariant

**`build(parse(input)) === input`** is the fundamental invariant. Every parsed node stores the original raw text. Building from a parsed object always reproduces the exact original input, including:

- Original whitespace (not trimmed or normalized)
- Original casing (ABNF matches case-insensitively, but original case is preserved)
- Leading zeros in numbers (`"007"` stays `"007"`)
- Any formatting quirks in the source message

This is critical for SIP, where proxies modify-and-forward messages and must not alter headers they don't understand.

### Two-Tier Lazy Parsing

Parsing is split into two tiers for performance:

1. **Tier 1 (Eager)**: Fast structural scan that validates the overall format and captures raw text spans + boundary offsets for each sub-rule. This always runs fully.

2. **Tier 2 (Lazy)**: Sub-rule decomposition into typed fields, triggered on first property access via getters. If you never access a sub-rule's typed properties, it's never parsed beyond the raw text scan.

```typescript
// Only Tier 1 runs here — fast structural validation
const result = ViaHeaderParser.parse(headerValue);

// Tier 2 triggers only for sentProtocol — other sub-rules remain unparsed
result.value.sentProtocol; // triggers lazy parse of this sub-rule only
```

This matters for SIP where a message may have dozens of headers but you typically only inspect a handful.

### MaybeNumeric

ABNF has no concept of "number" — `1*DIGIT` is just a character sequence. But consuming protocols (like SIP) often need numeric values. Rather than forcing a type decision at codegen time, digit-sequence patterns are wrapped in `MaybeNumeric`:

```typescript
class MaybeNumeric {
  readonly raw: string;       // always the original text
  toString(): string;         // returns raw (for reversibility)
  asNumber(): number;         // throws NumericConversionError if not finite
  asInteger(): number;        // throws if not a safe integer
}
```

**Pattern detection**: The analyzer recognizes these ABNF patterns as numeric:
- `1*DIGIT`, `*DIGIT`, `1*3DIGIT` — integer-like
- `1*DIGIT "." 1*DIGIT` — decimal-like
- `DIGIT` — single digit reference

The SIP layer decides whether `.asNumber()` or `.asInteger()` is appropriate for each context. The ABNF layer never loses information.

### Core Rules

The 16 RFC 5234 Appendix B core rules (ALPHA, DIGIT, HEXDIG, DQUOTE, SP, HTAB, CRLF, etc.) are defined in `grammars/core.abnf` and parsed by the same reader as user-defined rules. There are no special-cased primitives in code — core rules go through the identical codegen pipeline.

### Dependency Resolution

- **Topological sorting** via Tarjan's SCC algorithm ensures rules are generated in dependency order
- **Cycle detection** identifies mutually recursive rules, which use lazy getter patterns in generated code
- **Forward references** are supported — rules can reference rules defined later in the file (or in a different file when merging)

### Type Categories

The analyzer classifies each rule into a type category that drives codegen:

| Category | ABNF Pattern | Generated Type |
|----------|-------------|----------------|
| `literal` | `"hello"` | String literal match |
| `alternation` | `"a" / "b"` | Union type with try-each parsing |
| `concatenation` | `"x" "y"` | Sequence with per-element parsing |
| `repetition` | `1*DIGIT` | Loop with min/max bounds |
| `numeric` | `1*DIGIT` (detected) | `MaybeNumeric` wrapper |
| `range` | `%x41-5A` | Character code range check |
| `reference` | `other-rule` | Delegates to referenced rule's parser |
| `group` | `("a" / "b") "c"` | Grouped sub-expression |
| `prose` | `<description>` | Opaque string (unparseable) |

## Architecture

```
.abnf files ──→ Reader ──→ AST ──→ Analyzer ──→ IR ──→ Codegen ──→ .ts files
                  │                    │                   │
                  │               dependency          type emitter
              wraps `abnf`        graph +             parser emitter
              npm package         pattern             builder emitter
                                  detector            facade emitter
```

### Project Structure

```
src/
├── runtime/              # Shipped alongside generated code
│   ├── maybe-numeric.ts  # MaybeNumeric class
│   ├── parse-result.ts   # ParseResult<T>, ParseError
│   └── index.ts          # Barrel exports
├── reader/               # ABNF file → AST (wraps `abnf` npm package)
│   ├── index.ts          # readString(), readFile(), validateRefs()
│   └── types.ts          # TypeScript types for the AST
├── analyzer/             # AST → enriched IR
│   ├── index.ts          # analyze() — main entry
│   ├── dependency-graph.ts  # Tarjan's SCC, topological sort
│   └── pattern-detector.ts  # Digit-sequence → MaybeNumeric detection
├── codegen/              # IR → TypeScript source text
│   ├── index.ts          # generate() — orchestrator
│   ├── type-emitter.ts   # Node classes with lazy getters
│   ├── parser-emitter.ts # Parse methods (two-tier)
│   └── builder-emitter.ts # Build methods (raw-preserving)
├── cli.ts                # CLI entry point
└── index.ts              # Library entry point

grammars/
└── core.abnf             # RFC 5234 Appendix B core rules

tests/
├── runtime/              # MaybeNumeric, ParseResult tests
├── reader/               # ABNF parsing tests
├── analyzer/             # Dependency graph, pattern detection tests
├── codegen/              # Generated code structure tests
└── e2e/                  # Full pipeline tests
```

## Dependencies

| Package | Purpose | License |
|---------|---------|---------|
| `abnf` v5.x | Parse ABNF grammar text into AST | Apache-2.0 |
| `typescript` | Type checking and compilation | Apache-2.0 |
| `vitest` v2.x | Test framework | MIT |

## Testing

```bash
# Run all tests
npx vitest run --reporter=verbose

# Run specific test suite
npx vitest run tests/runtime/
npx vitest run tests/reader/
npx vitest run tests/analyzer/
npx vitest run tests/codegen/
npx vitest run tests/e2e/

# Watch mode
npx vitest --reporter=verbose
```

**78 tests** across 6 test files covering:
- Runtime primitives (MaybeNumeric safe/unsafe casts, ParseResult)
- ABNF reading (parse core.abnf, alternations, concatenations, ranges, repetitions)
- Analyzer (dependency ordering, cycle detection, MaybeNumeric pattern detection, type categories)
- Code generation (per-node-type codegen, imports, barrel exports, facade)
- E2E pipeline (core.abnf full generation, SIP-like grammar, multi-file merge)

## Node.js Compatibility

Targets Node.js 18+. All dependencies are pinned to versions compatible with Node 18.

## License

MIT
