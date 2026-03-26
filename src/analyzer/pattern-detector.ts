import type { ASTNode } from '../reader/types.js';

/**
 * Describes a detected numeric pattern in an ABNF rule.
 */
export interface NumericPattern {
    /** Whether the pattern matches a digit sequence */
    isNumeric: boolean;
    /** Whether a decimal point is present (e.g. *DIGIT "." 1*DIGIT) */
    hasDecimal: boolean;
    /** Minimum digits (from repetition min) */
    minDigits: number;
    /** Maximum digits (from repetition max), null = unbounded */
    maxDigits: number | null;
}

const NO_NUMERIC: NumericPattern = {
    isNumeric: false,
    hasDecimal: false,
    minDigits: 0,
    maxDigits: null,
};

/**
 * Detect whether an AST node represents a digit-sequence pattern
 * that should be wrapped in MaybeNumeric.
 *
 * Recognized patterns:
 *  - 1*DIGIT, *DIGIT, 1*3DIGIT  (pure integer-like)
 *  - 1*DIGIT "." 1*DIGIT        (decimal-like)
 *  - DIGIT                      (single digit ref)
 */
export function detectNumericPattern(node: ASTNode, ruleNames?: Set<string>): NumericPattern {
    return walk(node, ruleNames);
}

function walk(node: ASTNode, ruleNames?: Set<string>): NumericPattern {
    switch (node.type) {
        case 'ruleref':
            return checkRuleRef(node.name);

        case 'repetition':
            return checkRepetition(node, ruleNames);

        case 'concatenation':
            return checkConcatenation(node, ruleNames);

        case 'group':
            return walk(node.alt, ruleNames);

        default:
            return NO_NUMERIC;
    }
}

function checkRuleRef(name: string): NumericPattern {
    if (name.toUpperCase() === 'DIGIT') {
        return { isNumeric: true, hasDecimal: false, minDigits: 1, maxDigits: 1 };
    }
    return NO_NUMERIC;
}

function isDigitRef(node: ASTNode): boolean {
    return node.type === 'ruleref' && node.name.toUpperCase() === 'DIGIT';
}

function isLiteralDot(node: ASTNode): boolean {
    if (node.type === 'caseInsensitveString' || node.type === 'caseSensitveString') {
        return node.str === '.';
    }
    return false;
}

function checkRepetition(node: { rep: { min: number; max: number | null }; el: ASTNode }, ruleNames?: Set<string>): NumericPattern {
    if (isDigitRef(node.el)) {
        return {
            isNumeric: true,
            hasDecimal: false,
            minDigits: node.rep.min,
            maxDigits: node.rep.max,
        };
    }
    return NO_NUMERIC;
}

function checkConcatenation(node: { elements: ASTNode[] }, ruleNames?: Set<string>): NumericPattern {
    const els = node.elements;

    // Look for pattern: <digits> "." <digits>
    // Where <digits> is either DIGIT or n*mDIGIT
    if (els.length === 3 && isLiteralDot(els[1])) {
        const left = walk(els[0], ruleNames);
        const right = walk(els[2], ruleNames);
        if (left.isNumeric && right.isNumeric) {
            return {
                isNumeric: true,
                hasDecimal: true,
                minDigits: left.minDigits + right.minDigits + 1, // +1 for dot
                maxDigits: null, // hard to bound with decimal
            };
        }
    }

    return NO_NUMERIC;
}

// ---- Literal pattern detection ----

/**
 * Describes a rule whose definition is a single string literal or an
 * alternation of pure string literals. Used to emit a typed `.value`
 * getter with a string-literal union type on the Node class.
 */
export interface LiteralPattern {
    /** Canonical forms of each alternative (uppercase for case-insensitive) */
    alternatives: string[];
    /** True when every alternative is case-sensitive (%s"...") */
    caseSensitive: boolean;
}

/**
 * Detect whether an AST node is a pure string literal or an alternation
 * of pure string literals. Returns null when non-literal nodes are present.
 */
export function detectLiteralPattern(node: ASTNode): LiteralPattern | null {
    const lit = unwrapToLiteral(node);
    if (lit) {
        return { alternatives: [lit.canonical], caseSensitive: lit.caseSensitive };
    }

    if (node.type === 'alternation') {
        const alternatives: string[] = [];
        let allCaseSensitive = true;
        let allCaseInsensitive = true;

        for (const alt of node.alts) {
            const l = unwrapToLiteral(alt);
            if (!l) return null;
            alternatives.push(l.canonical);
            if (l.caseSensitive) allCaseInsensitive = false;
            else allCaseSensitive = false;
        }

        // Require uniform case sensitivity across all alternatives
        if (!allCaseSensitive && !allCaseInsensitive) return null;

        // Deduplicate (e.g. "invite" / "INVITE" both map to "INVITE")
        const unique = [...new Set(alternatives)];
        return { alternatives: unique, caseSensitive: allCaseSensitive };
    }

    return null;
}

function unwrapToLiteral(node: ASTNode): { canonical: string; caseSensitive: boolean } | null {
    if (node.type === 'caseInsensitveString') {
        return { canonical: node.str.toUpperCase(), caseSensitive: false };
    }
    if (node.type === 'caseSensitveString') {
        return { canonical: node.str, caseSensitive: true };
    }
    if (node.type === 'group') {
        return unwrapToLiteral(node.alt);
    }
    return null;
}
