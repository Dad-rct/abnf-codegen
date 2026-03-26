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
