import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { readString, readFile, validateRefs } from '../../src/reader/index.js';

const CORE_ABNF_PATH = path.resolve(__dirname, '../../grammars/core.abnf');

describe('ABNF Reader', () => {
    describe('readString()', () => {
        it('parses a simple rule', () => {
            const rules = readString('my-rule = "hello"\r\n');
            expect(rules.first).toBe('MY-RULE');
            expect(rules.defs['MY-RULE']).toBeDefined();
            expect(rules.defs['MY-RULE'].name).toBe('my-rule');
        });

        it('parses alternation', () => {
            const rules = readString('choice = "a" / "b" / "c"\r\n');
            const def = rules.defs['CHOICE'].def;
            expect(def.type).toBe('alternation');
            if (def.type === 'alternation') {
                expect(def.alts).toHaveLength(3);
            }
        });

        it('parses concatenation', () => {
            const rules = readString('pair = "x" "y"\r\n');
            const def = rules.defs['PAIR'].def;
            expect(def.type).toBe('concatenation');
            if (def.type === 'concatenation') {
                expect(def.elements).toHaveLength(2);
            }
        });

        it('parses repetition', () => {
            const rules = readString('digits = 1*DIGIT\r\n');
            const def = rules.defs['DIGITS'].def;
            expect(def.type).toBe('repetition');
            if (def.type === 'repetition') {
                expect(def.rep.min).toBe(1);
                expect(def.rep.max).toBeNull();
            }
        });

        it('parses bounded repetition', () => {
            const rules = readString('short = 1*3DIGIT\r\n');
            const def = rules.defs['SHORT'].def;
            expect(def.type).toBe('repetition');
            if (def.type === 'repetition') {
                expect(def.rep.min).toBe(1);
                expect(def.rep.max).toBe(3);
            }
        });

        it('parses value ranges', () => {
            const rules = readString('alpha-lower = %x61-7A\r\n');
            const def = rules.defs['ALPHA-LOWER'].def;
            expect(def.type).toBe('range');
            if (def.type === 'range') {
                expect(def.first).toBe(0x61);
                expect(def.last).toBe(0x7a);
            }
        });

        it('parses multiple rules', () => {
            const input = 'rule-a = "a"\r\nrule-b = "b"\r\n';
            const rules = readString(input);
            expect(rules.defs['RULE-A']).toBeDefined();
            expect(rules.defs['RULE-B']).toBeDefined();
            expect(rules.first).toBe('RULE-A');
        });

        it('parses rule references', () => {
            const input = 'top = sub\r\nsub = "x"\r\n';
            const rules = readString(input);
            const topDef = rules.defs['TOP'].def;
            expect(topDef.type).toBe('ruleref');
            if (topDef.type === 'ruleref') {
                expect(topDef.name).toBe('sub');
            }
        });

        it('parses groups', () => {
            const rules = readString('grouped = ("a" / "b") "c"\r\n');
            const def = rules.defs['GROUPED'].def;
            expect(def.type).toBe('concatenation');
        });

        it('throws on invalid ABNF', () => {
            expect(() => readString('= bad syntax\r\n')).toThrow();
        });
    });

    describe('readFile()', () => {
        it('parses core.abnf', () => {
            const rules = readFile(CORE_ABNF_PATH);
            expect(rules.first).toBe('ALPHA');
            expect(rules.defs['ALPHA']).toBeDefined();
            expect(rules.defs['DIGIT']).toBeDefined();
            expect(rules.defs['DQUOTE']).toBeDefined();
            expect(rules.defs['SP']).toBeDefined();
            expect(rules.defs['HTAB']).toBeDefined();
            expect(rules.defs['CRLF']).toBeDefined();
            expect(rules.defs['HEXDIG']).toBeDefined();
            expect(rules.defs['VCHAR']).toBeDefined();
            expect(rules.defs['WSP']).toBeDefined();
            expect(rules.defs['LWSP']).toBeDefined();
            expect(rules.defs['OCTET']).toBeDefined();
            expect(rules.defs['CR']).toBeDefined();
            expect(rules.defs['LF']).toBeDefined();
            expect(rules.defs['CTL']).toBeDefined();
            expect(rules.defs['CHAR']).toBeDefined();
            expect(rules.defs['BIT']).toBeDefined();
        });

        it('core.abnf has all 16 core rules', () => {
            const rules = readFile(CORE_ABNF_PATH);
            expect(Object.keys(rules.defs)).toHaveLength(16);
        });
    });

    describe('validateRefs()', () => {
        it('returns null for valid grammar', () => {
            const rules = readString('top = sub\r\nsub = "x"\r\n');
            expect(validateRefs(rules)).toBeNull();
        });

        it('returns errors for undefined references', () => {
            const rules = readString('top = missing\r\n');
            const errors = validateRefs(rules);
            expect(errors).not.toBeNull();
            expect(errors!.length).toBeGreaterThan(0);
        });
    });
});
