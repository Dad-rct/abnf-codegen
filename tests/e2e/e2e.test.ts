import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { readString, readFile } from '../../src/reader/index.js';
import { analyze } from '../../src/analyzer/index.js';
import { generate } from '../../src/codegen/index.js';

const CORE_ABNF_PATH = path.resolve(__dirname, '../../grammars/core.abnf');

describe('E2E: Code Generation', () => {
    it('generates files for core.abnf without errors', () => {
        const rules = readFile(CORE_ABNF_PATH);
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        // Should have 16 rule files + index + grammar = 18
        expect(files.length).toBe(18);

        // Every file should have non-empty content
        for (const file of files) {
            expect(file.content.length).toBeGreaterThan(0);
            expect(file.filename).toMatch(/\.ts$/);
        }
    });

    it('generates correct filenames for core rules', () => {
        const rules = readFile(CORE_ABNF_PATH);
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const filenames = files.map(f => f.filename).sort();
        expect(filenames).toContain('alpha.ts');
        expect(filenames).toContain('digit.ts');
        expect(filenames).toContain('sp.ts');
        expect(filenames).toContain('htab.ts');
        expect(filenames).toContain('crlf.ts');
        expect(filenames).toContain('dquote.ts');
        expect(filenames).toContain('index.ts');
        expect(filenames).toContain('grammar.ts');
    });

    it('generated code contains parse and build methods', () => {
        const rules = readFile(CORE_ABNF_PATH);
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const digitFile = files.find(f => f.filename === 'digit.ts')!;
        expect(digitFile.content).toContain('DigitNode');
        expect(digitFile.content).toContain('DigitParser');
        expect(digitFile.content).toContain('DigitBuilder');
        expect(digitFile.content).toContain('parse(input: string');
        expect(digitFile.content).toContain('build(value:');
    });

    it('generated grammar facade has all core rules', () => {
        const rules = readFile(CORE_ABNF_PATH);
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const facade = files.find(f => f.filename === 'grammar.ts')!;
        expect(facade.content).toContain('class Grammar');
        expect(facade.content).toContain('AlphaParser');
        expect(facade.content).toContain('DigitParser');
        expect(facade.content).toContain('SpParser');
        expect(facade.content).toContain('CrlfParser');
    });
});

describe('E2E: Pipeline for SIP-like grammar', () => {
    const SIP_LIKE_ABNF = [
        'Method     = "INVITE" / "ACK" / "BYE" / "CANCEL" / "OPTIONS" / "REGISTER"',
        'token-char = %x21 / %x23-27 / %x2A-2B / %x2D-2E / %x30-39 / %x41-5A / %x5E-7A / %x7C / %x7E',
        'Max-Forwards = 1*DIGIT',
        'content-length = 1*DIGIT',
        '',
    ].join('\r\n');

    it('parses SIP-like ABNF', () => {
        const rules = readString(SIP_LIKE_ABNF);
        expect(Object.keys(rules.defs)).toHaveLength(4);
        expect(rules.defs['METHOD']).toBeDefined();
        expect(rules.defs['MAX-FORWARDS']).toBeDefined();
    });

    it('analyzes SIP-like grammar', () => {
        const rules = readString(SIP_LIKE_ABNF);
        const analyzed = analyze(rules);

        // Method is alternation
        expect(analyzed.ruleAnalysis.get('METHOD')!.typeCategory).toBe('alternation');
        // Max-Forwards is numeric (1*DIGIT)
        expect(analyzed.ruleAnalysis.get('MAX-FORWARDS')!.typeCategory).toBe('numeric');
        expect(analyzed.ruleAnalysis.get('MAX-FORWARDS')!.numericPattern.isNumeric).toBe(true);
    });

    it('generates code for SIP-like grammar', () => {
        const rules = readString(SIP_LIKE_ABNF);
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        // 4 rules + index + grammar = 6
        expect(files.length).toBe(6);

        const methodFile = files.find(f => f.filename === 'method.ts')!;
        expect(methodFile.content).toContain('MethodParser');
        expect(methodFile.content).toContain('"INVITE"');
        expect(methodFile.content).toContain('"BYE"');
        // Literal alternation should produce a typed .value getter
        expect(methodFile.content).toContain("get value(): 'INVITE' | 'ACK' | 'BYE' | 'CANCEL' | 'OPTIONS' | 'REGISTER'");

        const maxFwdFile = files.find(f => f.filename === 'max-forwards.ts')!;
        expect(maxFwdFile.content).toContain('MaxForwardsParser');
        expect(maxFwdFile.content).toContain('while');
    });
});

describe('E2E: Multi-file merge', () => {
    it('merges rules from multiple ABNF inputs', () => {
        const base = readString('base-rule = "a"\r\n');
        const ext = readString('ext-rule = base-rule "b"\r\n');

        // Simulate merge (the CLI does this via mergeRules)
        for (const [name, rule] of Object.entries(ext.defs)) {
            if (!(name in base.defs)) {
                (base.defs as any)[name] = rule;
            }
        }

        expect(base.defs['BASE-RULE']).toBeDefined();
        expect(base.defs['EXT-RULE']).toBeDefined();

        const analyzed = analyze(base);
        const files = generate(analyzed);
        expect(files.length).toBe(4); // 2 rules + index + grammar
    });
});
