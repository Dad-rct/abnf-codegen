import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { readString } from '../../src/reader/index.js';
import { analyze } from '../../src/analyzer/index.js';
import { generate } from '../../src/codegen/index.js';

// Self-contained SIP-like grammar exercising key patterns:
//   - range              (digit, alpha, sp)
//   - literal alternation (method)         → .value getter
//   - numeric repetition  (status-code)    → MaybeNumeric
//   - concatenation + rulerefs (request-line) → lazy getters
const GRAMMAR = [
    'digit = %x30-39',
    'alpha = %x41-5A / %x61-7A',
    'sp = %x20',
    'method = "INVITE" / "ACK" / "BYE" / "CANCEL"',
    'status-code = 3digit',
    'max-forwards = 1*digit',
    'request-line = method sp status-code',
    '',
].join('\r\n');

describe('E2E: Eval generated code', () => {
    let mod: Record<string, any>;
    const outDir = path.resolve(__dirname, '../.test-output', `eval-${Date.now()}`);

    beforeAll(async () => {
        const runtimeRelative = path.relative(outDir, path.resolve(__dirname, '../../src/runtime/index.js'))
            .split(path.sep).join('/');

        const rules = readString(GRAMMAR);
        const analyzed = analyze(rules);
        const files = generate(analyzed, { runtimeImport: runtimeRelative });

        fs.mkdirSync(outDir, { recursive: true });
        for (const file of files) {
            fs.writeFileSync(path.join(outDir, file.filename), file.content);
        }

        mod = await import(path.join(outDir, 'index.ts'));
    });

    // ---- Range rules ----

    it('parses a single digit', () => {
        const result = mod.DigitParser.parse('5');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('5');
    });

    it('rejects non-digit', () => {
        const result = mod.DigitParser.parse('x');
        expect(result.success).toBe(false);
    });

    // ---- Literal alternation with .value getter ----

    it('parses a method literal', () => {
        const result = mod.MethodParser.parse('INVITE');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('INVITE');
    });

    it('parses case-insensitive method', () => {
        const result = mod.MethodParser.parse('invite');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('invite');
    });

    it('.value returns canonical uppercase', () => {
        const result = mod.MethodParser.parse('invite');
        expect(result.value.value).toBe('INVITE');
    });

    it('.value round-trip preserves original casing', () => {
        const result = mod.MethodParser.parse('Invite');
        expect(result.value.raw).toBe('Invite');
        expect(result.value.value).toBe('INVITE');
        expect(result.value.toString()).toBe('Invite');
    });

    it('rejects unknown method', () => {
        const result = mod.MethodParser.parse('PATCH');
        expect(result.success).toBe(false);
    });

    // ---- MaybeNumeric (1*DIGIT) ----

    it('parses max-forwards as MaybeNumeric', () => {
        const result = mod.MaxForwardsParser.parse('70');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('70');
    });

    it('round-trips max-forwards', () => {
        const input = '070';
        const result = mod.MaxForwardsParser.parse(input);
        expect(mod.MaxForwardsBuilder.build(result.value)).toBe(input);
    });

    // ---- Bounded repetition (3digit) ----

    it('parses status-code as exactly 3 digits', () => {
        const result = mod.StatusCodeParser.parse('200');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('200');
    });

    it('rejects status-code with fewer than 3 digits', () => {
        const result = mod.StatusCodeParser.parse('20');
        expect(result.success).toBe(false);
    });

    it('parses only 3 digits from longer input', () => {
        const result = mod.StatusCodeParser.parse('2001');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('200');
        expect(result.nextOffset).toBe(3);
    });

    // ---- Concatenation with lazy sub-rule getters ----

    it('parses request-line', () => {
        const result = mod.RequestLineParser.parse('INVITE 200');
        expect(result.success).toBe(true);
        expect(result.value.raw).toBe('INVITE 200');
    });

    it('lazy getter: .method returns parsed sub-node', () => {
        const result = mod.RequestLineParser.parse('ACK 404');
        expect(result.success).toBe(true);
        const node = result.value;
        expect(node.method).toBeDefined();
        expect(node.method.raw).toBe('ACK');
    });

    it('lazy getter: .statusCode returns parsed sub-node', () => {
        const result = mod.RequestLineParser.parse('BYE 500');
        expect(result.success).toBe(true);
        const node = result.value;
        expect(node.statusCode).toBeDefined();
        expect(node.statusCode.raw).toBe('500');
    });

    it('lazy getter: .method.value returns canonical form', () => {
        const result = mod.RequestLineParser.parse('invite 200');
        const node = result.value;
        expect(node.method.value).toBe('INVITE');
    });

    it('rejects invalid request-line', () => {
        const result = mod.RequestLineParser.parse('INVITE');
        expect(result.success).toBe(false);
    });

    // ---- Round-trip invariant ----

    it('round-trips method', () => {
        const input = 'CANCEL';
        const result = mod.MethodParser.parse(input);
        expect(mod.MethodBuilder.build(result.value)).toBe(input);
    });

    it('round-trips case-insensitive method', () => {
        const input = 'Cancel';
        const result = mod.MethodParser.parse(input);
        expect(mod.MethodBuilder.build(result.value)).toBe(input);
    });

    it('round-trips request-line', () => {
        const input = 'INVITE 200';
        const result = mod.RequestLineParser.parse(input);
        expect(mod.RequestLineBuilder.build(result.value)).toBe(input);
    });

    it('round-trips status-code', () => {
        const input = '404';
        const result = mod.StatusCodeParser.parse(input);
        expect(mod.StatusCodeBuilder.build(result.value)).toBe(input);
    });
});
