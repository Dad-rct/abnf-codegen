import type { AnalyzedGrammar, RuleAnalysis } from '../analyzer/index.js';
import { toPascalCase, toCamelCase, emitNodeType } from './type-emitter.js';
import { emitParserClass } from './parser-emitter.js';
import { emitBuilderClass } from './builder-emitter.js';

export { toPascalCase, toCamelCase } from './type-emitter.js';

/**
 * A single generated file (filename + content).
 */
export interface GeneratedFile {
    filename: string;
    content: string;
}

/**
 * Options for code generation.
 */
export interface GenerateOptions {
    /** Import path for runtime types (ParseResult, MaybeNumeric, etc.).
     *  Defaults to '../runtime/index.js'. */
    runtimeImport?: string;
}

const DEFAULT_RUNTIME_IMPORT = '../runtime/index.js';

/**
 * Generate all TypeScript files for an analyzed ABNF grammar.
 */
export function generate(grammar: AnalyzedGrammar, options?: GenerateOptions): GeneratedFile[] {
    const runtimeImport = options?.runtimeImport ?? DEFAULT_RUNTIME_IMPORT;
    const files: GeneratedFile[] = [];

    // Generate per-rule files
    for (const [name, analysis] of grammar.ruleAnalysis) {
        const file = generateRuleFile(analysis, grammar, runtimeImport);
        files.push(file);
    }

    // Generate barrel index
    files.push(generateIndex(grammar, runtimeImport));

    // Generate facade class
    files.push(generateFacade(grammar));

    return files;
}

function generateRuleFile(analysis: RuleAnalysis, grammar: AnalyzedGrammar, runtimeImport: string): GeneratedFile {
    const filename = `${analysis.originalName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ts`;
    const className = toPascalCase(analysis.originalName);
    const sections: string[] = [];

    // Imports
    sections.push(generateImports(analysis, grammar, runtimeImport));

    // Node class
    sections.push(emitNodeType(analysis, grammar));

    // Parser class
    sections.push(emitParserClass(analysis, grammar));

    // Builder class
    sections.push(emitBuilderClass(analysis, grammar));

    return { filename, content: sections.join('\n\n') + '\n' };
}

function generateImports(analysis: RuleAnalysis, grammar: AnalyzedGrammar, runtimeImport: string): string {
    const lines: string[] = [];
    lines.push(`import { type ParseResult, ParseError, success, failure } from '${runtimeImport}';`);

    // Check if MaybeNumeric is needed
    if (analysis.numericPattern.isNumeric || needsMaybeNumeric(analysis, grammar)) {
        lines.push(`import { MaybeNumeric } from '${runtimeImport}';`);
    }

    // Import referenced rule parsers/nodes
    for (const refName of analysis.references) {
        const refAnalysis = grammar.ruleAnalysis.get(refName);
        if (refAnalysis && refName !== analysis.name) {
            const refFile = refAnalysis.originalName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const refClass = toPascalCase(refAnalysis.originalName);
            lines.push(`import { ${refClass}Node, ${refClass}Parser } from './${refFile}.js';`);
        }
    }

    return lines.join('\n');
}

function needsMaybeNumeric(analysis: RuleAnalysis, grammar: AnalyzedGrammar): boolean {
    for (const refName of analysis.references) {
        const refAnalysis = grammar.ruleAnalysis.get(refName);
        if (refAnalysis?.numericPattern.isNumeric) return true;
    }
    return false;
}

function generateIndex(grammar: AnalyzedGrammar, runtimeImport: string): GeneratedFile {
    const lines: string[] = [];
    lines.push(`export { type ParseResult, ParseError, success, failure, MaybeNumeric } from '${runtimeImport}';`);

    for (const [name, analysis] of grammar.ruleAnalysis) {
        const file = analysis.originalName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const className = toPascalCase(analysis.originalName);
        lines.push(`export { ${className}Node, ${className}Parser, ${className}Builder } from './${file}.js';`);
    }

    lines.push(`export { Grammar } from './grammar.js';`);

    return { filename: 'index.ts', content: lines.join('\n') + '\n' };
}

function generateFacade(grammar: AnalyzedGrammar): GeneratedFile {
    const lines: string[] = [];
    const imports: string[] = [];
    const properties: string[] = [];

    for (const [name, analysis] of grammar.ruleAnalysis) {
        const file = analysis.originalName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const className = toPascalCase(analysis.originalName);
        const propName = toCamelCase(analysis.originalName);

        imports.push(`import { ${className}Parser, ${className}Builder } from './${file}.js';`);
        properties.push(`  readonly ${propName} = {`);
        properties.push(`    parse: ${className}Parser.parse,`);
        properties.push(`    build: ${className}Builder.build,`);
        properties.push(`  };`);
    }

    lines.push(imports.join('\n'));
    lines.push('');
    lines.push('export class Grammar {');
    lines.push(properties.join('\n'));
    lines.push('}');

    return { filename: 'grammar.ts', content: lines.join('\n') + '\n' };
}
