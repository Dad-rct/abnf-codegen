// @ts-expect-error — abnf has no type declarations
import { parseString, parseFile, checkRefs } from 'abnf';
import type { Rules } from './types.js';

export { type Rules, type Rule, type RuleRef, type ASTNode } from './types.js';

/**
 * Parse an ABNF grammar string into a Rules AST.
 * @param input    ABNF grammar text
 * @param source   Optional source identifier for error messages
 * @returns        Parsed rules AST
 */
export function readString(input: string, source: string = 'input'): Rules {
    return parseString(input, source) as unknown as Rules;
}

/**
 * Parse an ABNF grammar file into a Rules AST.
 * @param filePath  Path to .abnf file
 * @returns         Parsed rules AST
 */
export function readFile(filePath: string): Rules {
    return parseFile(filePath) as unknown as Rules;
}

/**
 * Validates that all rule references in the grammar resolve to defined rules.
 * @returns null if valid, or an array of error strings.
 */
export function validateRefs(rules: Rules): string[] | null {
    return checkRefs(rules as any);
}
