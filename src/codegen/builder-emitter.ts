import type { ASTNode } from '../reader/types.js';
import type { AnalyzedGrammar, RuleAnalysis } from '../analyzer/index.js';
import { toPascalCase } from './type-emitter.js';

/**
 * Emit the builder class for a single ABNF rule.
 * The builder accepts an object (with optional .raw for round-tripping)
 * or builds from typed fields using sensible defaults.
 */
export function emitBuilderClass(analysis: RuleAnalysis, grammar: AnalyzedGrammar): string {
    const className = toPascalCase(analysis.originalName);
    const lines: string[] = [];

    lines.push(`export class ${className}Builder {`);
    lines.push(`  static build(value: ${className}Node | { raw: string } | string): string {`);
    lines.push(`    if (typeof value === 'string') return value;`);
    lines.push(`    return value.raw;`);
    lines.push(`  }`);
    lines.push(`}`);

    return lines.join('\n');
}
