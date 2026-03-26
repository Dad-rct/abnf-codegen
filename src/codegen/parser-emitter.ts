import type { ASTNode } from '../reader/types.js';
import type { AnalyzedGrammar, RuleAnalysis } from '../analyzer/index.js';
import { toPascalCase, toCamelCase } from './type-emitter.js';

/**
 * Emit the parser class for a single ABNF rule.
 * Generated parser performs a Tier-1 structural scan (eager),
 * capturing raw text + boundary offsets for lazy Tier-2 sub-rule parsing.
 */
export function emitParserClass(analysis: RuleAnalysis, grammar: AnalyzedGrammar): string {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];

    lines.push(`export class ${className}Parser {`);
    lines.push(`  static parse(input: string, offset: number = 0): ParseResult<${className}Node> {`);

    // Generate parse body based on node type
    const bodyLines = emitParseBody(analysis.def, analysis, grammar, 'offset');
    for (const line of bodyLines) {
        lines.push(`    ${line}`);
    }

    lines.push(`  }`);
    lines.push(`}`);

    return lines.join('\n');
}

function emitParseBody(node: ASTNode, analysis: RuleAnalysis, grammar: AnalyzedGrammar, offsetVar: string): string[] {
    switch (node.type) {
        case 'caseInsensitveString':
        case 'caseSensitveString':
            return emitLiteralParse(node, analysis, offsetVar);
        case 'alternation':
            return emitAlternationParse(node, analysis, grammar, offsetVar);
        case 'concatenation':
            return emitConcatenationParse(node, analysis, grammar, offsetVar);
        case 'repetition':
            return emitRepetitionParse(node, analysis, grammar, offsetVar);
        case 'range':
            return emitRangeParse(node, analysis, offsetVar);
        case 'ruleref':
            return emitRuleRefParse(node, analysis, grammar, offsetVar);
        case 'group':
            return emitParseBody(node.alt, analysis, grammar, offsetVar);
        case 'prose':
            return [`return failure('${analysis.name}', ${offsetVar}, 'prose', JSON.stringify(input.charAt(${offsetVar})));`];
        default:
            return [`return failure('${analysis.name}', ${offsetVar}, 'unknown', 'unknown');`];
    }
}

function emitLiteralParse(node: { str: string; type: string }, analysis: RuleAnalysis, offsetVar: string): string[] {
    const literal = node.str;
    const escaped = JSON.stringify(literal);
    const len = literal.length;
    const caseInsensitive = node.type === 'caseInsensitveString';
    const className = toPascalCase(analysis.originalName);

    const lines: string[] = [];
    if (caseInsensitive) {
        lines.push(`const slice = input.substring(${offsetVar}, ${offsetVar} + ${len});`);
        lines.push(`if (slice.toLowerCase() === ${JSON.stringify(literal.toLowerCase())}) {`);
        lines.push(`  const raw = slice;`);
        lines.push(`  return success(new ${className}Node(raw), ${offsetVar} + ${len});`);
        lines.push(`} else {`);
        lines.push(`  return failure('${analysis.name}', ${offsetVar}, ${escaped}, JSON.stringify(slice));`);
        lines.push(`}`);
    } else {
        lines.push(`if (input.startsWith(${escaped}, ${offsetVar})) {`);
        lines.push(`  return success(new ${className}Node(${escaped}), ${offsetVar} + ${len});`);
        lines.push(`} else {`);
        lines.push(`  return failure('${analysis.name}', ${offsetVar}, ${escaped}, JSON.stringify(input.substring(${offsetVar}, ${offsetVar} + ${len})));`);
        lines.push(`}`);
    }
    return lines;
}

function emitAlternationParse(node: { alts: ASTNode[] }, analysis: RuleAnalysis, grammar: AnalyzedGrammar, offsetVar: string): string[] {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];
    lines.push(`const errors: ParseError[] = [];`);

    for (let i = 0; i < node.alts.length; i++) {
        const altVar = `alt${i}`;
        lines.push(`const ${altVar} = (() => {`);
        const altBody = emitParseBranch(node.alts[i], analysis, grammar, offsetVar);
        for (const line of altBody) {
            lines.push(`  ${line}`);
        }
        lines.push(`})();`);
        lines.push(`if (${altVar}.success) {`);
        lines.push(`  return success(new ${className}Node(${altVar}.value.raw, ${altVar}.nextOffset), ${altVar}.nextOffset);`);
        lines.push(`}`);
        lines.push(`errors.push(${altVar}.error);`);
    }

    lines.push(`return failure('${analysis.name}', ${offsetVar}, 'one of ${node.alts.length} alternations', JSON.stringify(input.charAt(${offsetVar})), errors);`);
    return lines;
}

/**
 * Emit parse code for a branch within alternation — does NOT wrap in the top-level Node.
 */
function emitParseBranch(node: ASTNode, analysis: RuleAnalysis, grammar: AnalyzedGrammar, offsetVar: string): string[] {
    return emitParseBody(node, analysis, grammar, offsetVar);
}

function emitConcatenationParse(node: { elements: ASTNode[] }, analysis: RuleAnalysis, grammar: AnalyzedGrammar, offsetVar: string): string[] {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];
    let currentOffset = offsetVar;

    for (let i = 0; i < node.elements.length; i++) {
        const partVar = `part${i}`;
        const nextOffset = `offset${i}`;
        lines.push(`const ${partVar} = (() => {`);
        const partBody = emitParseBranch(node.elements[i], analysis, grammar, currentOffset);
        for (const line of partBody) {
            lines.push(`  ${line}`);
        }
        lines.push(`})();`);
        lines.push(`if (!${partVar}.success) return ${partVar};`);
        lines.push(`const ${nextOffset} = ${partVar}.nextOffset;`);
        currentOffset = nextOffset;
    }

    lines.push(`const raw = input.substring(${offsetVar}, ${currentOffset});`);
    lines.push(`return success(new ${className}Node(raw), ${currentOffset});`);
    return lines;
}

function emitRepetitionParse(node: { rep: { min: number; max: number | null }; el: ASTNode }, analysis: RuleAnalysis, grammar: AnalyzedGrammar, offsetVar: string): string[] {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];
    const { min, max } = node.rep;

    lines.push(`const items: string[] = [];`);
    lines.push(`let pos = ${offsetVar};`);

    if (max !== null) {
        lines.push(`while (items.length < ${max}) {`);
    } else {
        lines.push(`while (true) {`);
    }
    lines.push(`  const item = (() => {`);
    const elBody = emitParseBranch(node.el, analysis, grammar, 'pos');
    for (const line of elBody) {
        lines.push(`    ${line}`);
    }
    lines.push(`  })();`);
    lines.push(`  if (!item.success) break;`);
    lines.push(`  items.push(item.value.raw);`);
    lines.push(`  pos = item.nextOffset;`);
    lines.push(`}`);

    if (min > 0) {
        lines.push(`if (items.length < ${min}) {`);
        lines.push(`  return failure('${analysis.name}', ${offsetVar}, 'at least ${min} repetitions', String(items.length));`);
        lines.push(`}`);
    }

    lines.push(`const raw = input.substring(${offsetVar}, pos);`);
    lines.push(`return success(new ${className}Node(raw), pos);`);
    return lines;
}

function emitRangeParse(node: { first: number; last: number }, analysis: RuleAnalysis, offsetVar: string): string[] {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];
    lines.push(`const code = input.charCodeAt(${offsetVar});`);
    lines.push(`if (code >= ${node.first} && code <= ${node.last}) {`);
    lines.push(`  const raw = input.charAt(${offsetVar});`);
    lines.push(`  return success(new ${className}Node(raw), ${offsetVar} + 1);`);
    lines.push(`} else {`);
    lines.push(`  return failure('${analysis.name}', ${offsetVar}, 'char in range 0x${node.first.toString(16)}-0x${node.last.toString(16)}', JSON.stringify(input.charAt(${offsetVar})));`);
    lines.push(`}`);
    return lines;
}

function emitRuleRefParse(node: { name: string }, analysis: RuleAnalysis, grammar: AnalyzedGrammar, offsetVar: string): string[] {
    const refName = node.name.toUpperCase();
    const refAnalysis = grammar.ruleAnalysis.get(refName);
    const className = toPascalCase(analysis.originalName);

    if (!refAnalysis) {
        return [`return failure('${analysis.name}', ${offsetVar}, 'rule ${node.name}', 'undefined rule');`];
    }

    const refClass = toPascalCase(refAnalysis.originalName);
    const lines: string[] = [];
    lines.push(`const refResult = ${refClass}Parser.parse(input, ${offsetVar});`);
    lines.push(`if (refResult.success) {`);
    lines.push(`  return success(new ${className}Node(refResult.value.raw), refResult.nextOffset);`);
    lines.push(`} else {`);
    lines.push(`  return refResult;`);
    lines.push(`}`);
    return lines;
}
