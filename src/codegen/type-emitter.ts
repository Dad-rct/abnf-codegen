import type { ASTNode } from '../reader/types.js';
import type { AnalyzedGrammar, RuleAnalysis } from '../analyzer/index.js';

/**
 * Convert an ABNF rule name to a PascalCase TypeScript identifier.
 * e.g. "sent-protocol" → "SentProtocol", "CRLF" → "Crlf"
 */
export function toPascalCase(name: string): string {
    return name
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

/**
 * Convert an ABNF rule name to a camelCase TypeScript identifier.
 */
export function toCamelCase(name: string): string {
    const pascal = toPascalCase(name);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Emit the TypeScript type/interface for a parsed node.
 */
export function emitNodeType(analysis: RuleAnalysis, grammar: AnalyzedGrammar): string {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];

    lines.push(`export class ${className}Node {`);
    lines.push(`  readonly raw: string;`);

    // Emit lazy sub-rule fields based on component structure
    const fields = collectFields(analysis.def, grammar);
    for (const field of fields) {
        lines.push(`  private _${field.name}?: ${field.type};`);
        lines.push(`  private _${field.name}Start: number;`);
        lines.push(`  private _${field.name}End: number;`);
    }

    // Constructor
    const ctorParams = [`raw: string`];
    for (const field of fields) {
        ctorParams.push(`${field.name}Start: number`);
        ctorParams.push(`${field.name}End: number`);
    }
    lines.push('');
    lines.push(`  constructor(${ctorParams.join(', ')}) {`);
    lines.push(`    this.raw = raw;`);
    for (const field of fields) {
        lines.push(`    this._${field.name}Start = ${field.name}Start;`);
        lines.push(`    this._${field.name}End = ${field.name}End;`);
    }
    lines.push(`  }`);

    // Lazy getters for sub-rules
    for (const field of fields) {
        lines.push('');
        lines.push(`  get ${field.name}(): ${field.type} {`);
        lines.push(`    if (this._${field.name} === undefined) {`);
        lines.push(`      ${field.lazyInit}`);
        lines.push(`    }`);
        lines.push(`    return this._${field.name}!;`);
        lines.push(`  }`);
    }

    // toString for reversibility
    lines.push('');
    lines.push(`  toString(): string {`);
    lines.push(`    return this.raw;`);
    lines.push(`  }`);

    lines.push(`}`);

    return lines.join('\n');
}

export interface FieldInfo {
    name: string;
    type: string;
    lazyInit: string;
}

/**
 * Analyze an AST node and collect field info for sub-rules that need lazy getters.
 */
function collectFields(node: ASTNode, grammar: AnalyzedGrammar): FieldInfo[] {
    const fields: FieldInfo[] = [];

    switch (node.type) {
        case 'concatenation': {
            for (let i = 0; i < node.elements.length; i++) {
                const el = node.elements[i];
                const elFields = collectFieldsForElement(el, i, grammar);
                fields.push(...elFields);
            }
            break;
        }
        case 'ruleref': {
            const refName = node.name.toUpperCase();
            const refAnalysis = grammar.ruleAnalysis.get(refName);
            if (refAnalysis && refAnalysis.numericPattern.isNumeric) {
                fields.push({
                    name: toCamelCase(node.name),
                    type: 'MaybeNumeric',
                    lazyInit: `this._${toCamelCase(node.name)} = new MaybeNumeric(this.raw.substring(this._${toCamelCase(node.name)}Start, this._${toCamelCase(node.name)}End));`,
                });
            } else if (refAnalysis) {
                const refClass = toPascalCase(refAnalysis.originalName);
                const fieldName = toCamelCase(node.name);
                fields.push({
                    name: fieldName,
                    type: `${refClass}Node`,
                    lazyInit: `const result = ${refClass}Parser.parse(this.raw, this._${fieldName}Start); if (result.success) this._${fieldName} = result.value;`,
                });
            }
            break;
        }
        // Other node types don't produce lazy fields at this level
        default:
            break;
    }

    return fields;
}

function collectFieldsForElement(node: ASTNode, index: number, grammar: AnalyzedGrammar): FieldInfo[] {
    if (node.type === 'ruleref') {
        const refName = node.name.toUpperCase();
        const refAnalysis = grammar.ruleAnalysis.get(refName);
        if (refAnalysis && refAnalysis.numericPattern.isNumeric) {
            return [{
                name: toCamelCase(node.name),
                type: 'MaybeNumeric',
                lazyInit: `this._${toCamelCase(node.name)} = new MaybeNumeric(this.raw.substring(this._${toCamelCase(node.name)}Start, this._${toCamelCase(node.name)}End));`,
            }];
        } else if (refAnalysis) {
            const refClass = toPascalCase(refAnalysis.originalName);
            const fieldName = toCamelCase(node.name);
            return [{
                name: fieldName,
                type: `${refClass}Node`,
                lazyInit: `const result = ${refClass}Parser.parse(this.raw, this._${fieldName}Start); if (result.success) this._${fieldName} = result.value;`,
            }];
        }
    }
    return [];
}
