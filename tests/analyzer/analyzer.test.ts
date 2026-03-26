import { describe, it, expect } from 'vitest';
import { readString, readFile } from '../../src/reader/index.js';
import { buildDependencyGraph } from '../../src/analyzer/dependency-graph.js';
import { detectNumericPattern, detectLiteralPattern } from '../../src/analyzer/pattern-detector.js';
import { analyze } from '../../src/analyzer/index.js';
import * as path from 'node:path';

const CORE_ABNF_PATH = path.resolve(__dirname, '../../grammars/core.abnf');

describe('Dependency Graph', () => {
    it('sorts independent rules in definition order', () => {
        const rules = readString('a = "x"\r\nb = "y"\r\n');
        const graph = buildDependencyGraph(rules);
        expect(graph.sorted).toContain('A');
        expect(graph.sorted).toContain('B');
        expect(graph.cycles).toHaveLength(0);
    });

    it('sorts dependencies before dependents', () => {
        const rules = readString('top = mid\r\nmid = bot\r\nbot = "x"\r\n');
        const graph = buildDependencyGraph(rules);
        const idxBot = graph.sorted.indexOf('BOT');
        const idxMid = graph.sorted.indexOf('MID');
        const idxTop = graph.sorted.indexOf('TOP');
        expect(idxBot).toBeLessThan(idxMid);
        expect(idxMid).toBeLessThan(idxTop);
    });

    it('detects simple cycles', () => {
        const rules = readString('a = b\r\nb = a\r\n');
        const graph = buildDependencyGraph(rules);
        expect(graph.cycles.length).toBeGreaterThan(0);
        const cycleMembers = graph.cycles.flat();
        expect(cycleMembers).toContain('A');
        expect(cycleMembers).toContain('B');
    });

    it('detects self-reference cycle', () => {
        const rules = readString('list = "x" / list "," "x"\r\n');
        const graph = buildDependencyGraph(rules);
        expect(graph.cycles.length).toBeGreaterThan(0);
        expect(graph.cycles.flat()).toContain('LIST');
    });

    it('handles core.abnf without cycles', () => {
        const rules = readFile(CORE_ABNF_PATH);
        const graph = buildDependencyGraph(rules);
        expect(graph.sorted).toHaveLength(16);
        // Core rules should have no cycles (LWSP references WSP/CRLF but not cyclic)
        expect(graph.cycles).toHaveLength(0);
    });

    it('records edges correctly', () => {
        const rules = readString('top = a / b\r\na = "x"\r\nb = "y"\r\n');
        const graph = buildDependencyGraph(rules);
        const topRefs = graph.edges.get('TOP');
        expect(topRefs).toBeDefined();
        expect(topRefs!.has('A')).toBe(true);
        expect(topRefs!.has('B')).toBe(true);
    });
});

describe('Pattern Detector', () => {
    it('detects 1*DIGIT as numeric', () => {
        const rules = readString('num = 1*DIGIT\r\n');
        const def = rules.defs['NUM'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(true);
        expect(pat.hasDecimal).toBe(false);
        expect(pat.minDigits).toBe(1);
        expect(pat.maxDigits).toBeNull();
    });

    it('detects *DIGIT as numeric', () => {
        const rules = readString('num = *DIGIT\r\n');
        const def = rules.defs['NUM'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(true);
        expect(pat.minDigits).toBe(0);
        expect(pat.maxDigits).toBeNull();
    });

    it('detects 1*3DIGIT as bounded numeric', () => {
        const rules = readString('num = 1*3DIGIT\r\n');
        const def = rules.defs['NUM'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(true);
        expect(pat.minDigits).toBe(1);
        expect(pat.maxDigits).toBe(3);
    });

    it('detects DIGIT as single-digit numeric', () => {
        const rules = readString('d = DIGIT\r\n');
        const def = rules.defs['D'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(true);
        expect(pat.minDigits).toBe(1);
        expect(pat.maxDigits).toBe(1);
    });

    it('detects 1*DIGIT "." 1*DIGIT as decimal', () => {
        const rules = readString('dec = 1*DIGIT "." 1*DIGIT\r\n');
        const def = rules.defs['DEC'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(true);
        expect(pat.hasDecimal).toBe(true);
    });

    it('does not detect non-digit patterns', () => {
        const rules = readString('word = 1*ALPHA\r\n');
        const def = rules.defs['WORD'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(false);
    });

    it('does not detect string literals', () => {
        const rules = readString('lit = "hello"\r\n');
        const def = rules.defs['LIT'].def;
        const pat = detectNumericPattern(def);
        expect(pat.isNumeric).toBe(false);
    });
});

describe('Literal Pattern Detector', () => {
    it('detects a single case-insensitive literal', () => {
        const rules = readString('method = "INVITE"\r\n');
        const pat = detectLiteralPattern(rules.defs['METHOD'].def);
        expect(pat).not.toBeNull();
        expect(pat!.alternatives).toEqual(['INVITE']);
        expect(pat!.caseSensitive).toBe(false);
    });

    it('detects alternation of case-insensitive literals', () => {
        const rules = readString('method = "INVITE" / "ACK" / "BYE"\r\n');
        const pat = detectLiteralPattern(rules.defs['METHOD'].def);
        expect(pat).not.toBeNull();
        expect(pat!.alternatives).toEqual(['INVITE', 'ACK', 'BYE']);
        expect(pat!.caseSensitive).toBe(false);
    });

    it('uppercases canonical forms for case-insensitive literals', () => {
        const rules = readString('method = "invite" / "Ack"\r\n');
        const pat = detectLiteralPattern(rules.defs['METHOD'].def);
        expect(pat).not.toBeNull();
        expect(pat!.alternatives).toEqual(['INVITE', 'ACK']);
    });

    it('deduplicates after case normalization', () => {
        const rules = readString('method = "invite" / "INVITE"\r\n');
        const pat = detectLiteralPattern(rules.defs['METHOD'].def);
        expect(pat).not.toBeNull();
        expect(pat!.alternatives).toEqual(['INVITE']);
    });

    it('returns null for mixed literal and non-literal alternations', () => {
        const rules = readString('token = "a" / DIGIT\r\n');
        const pat = detectLiteralPattern(rules.defs['TOKEN'].def);
        expect(pat).toBeNull();
    });

    it('returns null for non-literal rules', () => {
        const rules = readString('num = 1*DIGIT\r\n');
        const pat = detectLiteralPattern(rules.defs['NUM'].def);
        expect(pat).toBeNull();
    });

    it('returns null for range rules', () => {
        const rules = readString('lower = %x61-7A\r\n');
        const pat = detectLiteralPattern(rules.defs['LOWER'].def);
        expect(pat).toBeNull();
    });
});

describe('Analyzer', () => {
    it('produces analysis for all rules', () => {
        const rules = readString('top = sub\r\nsub = "x"\r\n');
        const result = analyze(rules);
        expect(result.ruleAnalysis.size).toBe(2);
        expect(result.ruleAnalysis.has('TOP')).toBe(true);
        expect(result.ruleAnalysis.has('SUB')).toBe(true);
    });

    it('marks cyclic rules', () => {
        const rules = readString('a = b\r\nb = a\r\n');
        const result = analyze(rules);
        expect(result.ruleAnalysis.get('A')!.isCyclic).toBe(true);
        expect(result.ruleAnalysis.get('B')!.isCyclic).toBe(true);
    });

    it('assigns correct type categories', () => {
        const rules = readString(
            'lit = "hello"\r\n' +
            'alt = "a" / "b"\r\n' +
            'cat = "x" "y"\r\n' +
            'rep = 1*"z"\r\n' +
            'num = 1*DIGIT\r\n' +
            'rng = %x41-5A\r\n' +
            'ref = lit\r\n'
        );
        const result = analyze(rules);
        expect(result.ruleAnalysis.get('LIT')!.typeCategory).toBe('literal');
        expect(result.ruleAnalysis.get('ALT')!.typeCategory).toBe('alternation');
        expect(result.ruleAnalysis.get('CAT')!.typeCategory).toBe('concatenation');
        expect(result.ruleAnalysis.get('REP')!.typeCategory).toBe('repetition');
        expect(result.ruleAnalysis.get('NUM')!.typeCategory).toBe('numeric');
        expect(result.ruleAnalysis.get('RNG')!.typeCategory).toBe('range');
        expect(result.ruleAnalysis.get('REF')!.typeCategory).toBe('reference');
    });

    it('preserves original case in originalName', () => {
        const rules = readString('My-Rule = "x"\r\n');
        const result = analyze(rules);
        expect(result.ruleAnalysis.get('MY-RULE')!.originalName).toBe('My-Rule');
    });

    it('analyzes core.abnf completely', () => {
        const rules = readFile(CORE_ABNF_PATH);
        const result = analyze(rules);
        expect(result.ruleAnalysis.size).toBe(16);
        // DIGIT = %x30-39 is a range
        expect(result.ruleAnalysis.get('DIGIT')!.typeCategory).toBe('range');
    });

    it('detects literalPattern on alternation of string literals', () => {
        const rules = readString('method = "INVITE" / "ACK" / "BYE"\r\n');
        const result = analyze(rules);
        const analysis = result.ruleAnalysis.get('METHOD')!;
        expect(analysis.literalPattern).not.toBeNull();
        expect(analysis.literalPattern!.alternatives).toEqual(['INVITE', 'ACK', 'BYE']);
    });

    it('sets literalPattern to null for numeric rules', () => {
        const rules = readString('num = 1*DIGIT\r\n');
        const result = analyze(rules);
        expect(result.ruleAnalysis.get('NUM')!.literalPattern).toBeNull();
    });

    it('sets literalPattern to null for mixed alternations', () => {
        const rules = readString('token = "a" / DIGIT\r\n');
        const result = analyze(rules);
        expect(result.ruleAnalysis.get('TOKEN')!.literalPattern).toBeNull();
    });
});
