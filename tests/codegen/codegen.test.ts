import { describe, it, expect } from 'vitest';
import { readString } from '../../src/reader/index.js';
import { analyze } from '../../src/analyzer/index.js';
import { generate } from '../../src/codegen/index.js';
import { toPascalCase, toCamelCase } from '../../src/codegen/type-emitter.js';

describe('Codegen Utilities', () => {
    it('toPascalCase converts hyphenated names', () => {
        expect(toPascalCase('sent-protocol')).toBe('SentProtocol');
    });

    it('toPascalCase converts uppercase names', () => {
        expect(toPascalCase('CRLF')).toBe('Crlf');
    });

    it('toPascalCase handles single word', () => {
        expect(toPascalCase('alpha')).toBe('Alpha');
    });

    it('toCamelCase converts correctly', () => {
        expect(toCamelCase('sent-protocol')).toBe('sentProtocol');
        expect(toCamelCase('CRLF')).toBe('crlf');
    });
});

describe('Code Generator', () => {
    it('generates files for a simple literal rule', () => {
        const rules = readString('greeting = "hello"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        expect(files.length).toBe(3); // rule file + index + grammar
        const ruleFile = files.find(f => f.filename === 'greeting.ts');
        expect(ruleFile).toBeDefined();
        expect(ruleFile!.content).toContain('GreetingNode');
        expect(ruleFile!.content).toContain('GreetingParser');
        expect(ruleFile!.content).toContain('GreetingBuilder');
        expect(ruleFile!.content).toContain('parse(input: string');
    });

    it('generates alternation parse code', () => {
        const rules = readString('choice = "a" / "b" / "c"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'choice.ts')!;
        expect(ruleFile.content).toContain('ChoiceNode');
        expect(ruleFile.content).toContain('ChoiceParser');
        // Should have alternation logic
        expect(ruleFile.content).toContain('errors');
    });

    it('generates concatenation parse code', () => {
        const rules = readString('pair = "x" "y"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'pair.ts')!;
        expect(ruleFile.content).toContain('PairNode');
        expect(ruleFile.content).toContain('part0');
        expect(ruleFile.content).toContain('part1');
    });

    it('generates repetition parse code', () => {
        const rules = readString('digits = 1*DIGIT\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'digits.ts')!;
        expect(ruleFile.content).toContain('DigitsNode');
        expect(ruleFile.content).toContain('while');
        expect(ruleFile.content).toContain('at least 1');
    });

    it('generates range parse code', () => {
        const rules = readString('lower = %x61-7A\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'lower.ts')!;
        expect(ruleFile.content).toContain('charCodeAt');
        expect(ruleFile.content).toContain('97'); // 0x61
        expect(ruleFile.content).toContain('122'); // 0x7a
    });

    it('generates index barrel with correct exports', () => {
        const rules = readString('a = "x"\r\nb = "y"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const index = files.find(f => f.filename === 'index.ts')!;
        expect(index.content).toContain('ANode');
        expect(index.content).toContain('BNode');
        expect(index.content).toContain('Grammar');
    });

    it('generates facade grammar class', () => {
        const rules = readString('alpha = "a"\r\nbeta = "b"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const facade = files.find(f => f.filename === 'grammar.ts')!;
        expect(facade.content).toContain('class Grammar');
        expect(facade.content).toContain('alpha');
        expect(facade.content).toContain('beta');
        expect(facade.content).toContain('AlphaParser.parse');
        expect(facade.content).toContain('BetaParser.parse');
    });

    it('generates rule-reference parse code', () => {
        const rules = readString('top = sub\r\nsub = "x"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const topFile = files.find(f => f.filename === 'top.ts')!;
        expect(topFile.content).toContain('SubParser.parse');
        expect(topFile.content).toContain("import { SubNode, SubParser } from './sub.js'");
        // Node constructor should receive sub-rule offsets
        expect(topFile.content).toContain('new TopNode(raw, 0, raw.length)');
    });

    it('generates bounded repetition code', () => {
        const rules = readString('short = 1*3DIGIT\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'short.ts')!;
        expect(ruleFile.content).toContain('items.length < 3');
        expect(ruleFile.content).toContain('at least 1');
    });

    it('builder round-trips via .raw', () => {
        const rules = readString('tag = "hello"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'tag.ts')!;
        // Builder should accept string or object with raw
        expect(ruleFile.content).toContain("typeof value === 'string'");
        expect(ruleFile.content).toContain('value.raw');
    });

    it('generates .value getter for literal alternation', () => {
        const rules = readString('method = "INVITE" / "ACK" / "BYE"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'method.ts')!;
        expect(ruleFile.content).toContain("get value(): 'INVITE' | 'ACK' | 'BYE'");
        expect(ruleFile.content).toContain('this.raw.toUpperCase()');
    });

    it('generates .value getter for single literal', () => {
        const rules = readString('greeting = "hello"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'greeting.ts')!;
        expect(ruleFile.content).toContain("get value(): 'HELLO'");
        expect(ruleFile.content).toContain('this.raw.toUpperCase()');
    });

    it('does not generate .value getter for non-literal rules', () => {
        const rules = readString('digits = 1*DIGIT\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const ruleFile = files.find(f => f.filename === 'digits.ts')!;
        expect(ruleFile.content).not.toContain('get value()');
    });

    it('passes sub-rule offsets in concatenation constructor', () => {
        const rules = readString('pair = first second\r\nfirst = "a"\r\nsecond = "b"\r\n');
        const analyzed = analyze(rules);
        const files = generate(analyzed);

        const pairFile = files.find(f => f.filename === 'pair.ts')!;
        // Constructor should include offset args for first and second
        expect(pairFile.content).toContain('firstStart: number');
        expect(pairFile.content).toContain('secondStart: number');
        // Parser should pass offset expressions to constructor
        expect(pairFile.content).toMatch(/new PairNode\(raw, .+\)/);
    });
});
