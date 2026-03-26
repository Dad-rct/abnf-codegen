/**
 * TypeScript type definitions for the AST produced by the `abnf` npm package.
 * These mirror the runtime classes from abnf/lib/ast.js.
 */

export interface LocationInfo {
    source: string;
    start: { line: number; column: number };
    end: { line: number; column: number };
}

// ---- Leaf nodes ----

export interface Prose {
    type: 'prose';
    str: string;
    loc: LocationInfo;
}

export interface CaseInsensitiveString {
    type: 'caseInsensitveString'; // typo matches the abnf library
    str: string;
    loc: LocationInfo;
}

export interface CaseSensitiveString {
    type: 'caseSensitveString'; // typo matches the abnf library
    str: string;
    base: unknown;
    loc: LocationInfo;
}

export interface RuleRef {
    type: 'ruleref';
    name: string;
    loc: LocationInfo;
}

// ---- Composite nodes ----

export interface Concatenation {
    type: 'concatenation';
    elements: ASTNode[];
    loc: LocationInfo;
}

export interface Alternation {
    type: 'alternation';
    alts: ASTNode[];
    loc: LocationInfo;
}

export interface Repeat {
    type: 'repeat';
    min: number;
    max: number | null; // null = unbounded
    loc: LocationInfo;
}

export interface HashRepeat {
    type: 'hash_repeat';
    min: number;
    max: number | null;
    loc: LocationInfo;
}

export interface Repetition {
    type: 'repetition';
    rep: Repeat | HashRepeat;
    el: ASTNode;
    loc: LocationInfo;
}

export interface Range {
    type: 'range';
    base: unknown;
    first: number; // start code point
    last: number;  // end code point
    loc: LocationInfo;
}

export interface Group {
    type: 'group';
    alt: ASTNode;
    loc: LocationInfo;
}

// ---- Rule and Rules (root) ----

export interface Rule {
    type: 'rule';
    name: string;
    def: ASTNode;
    loc: LocationInfo;
}

export interface Rules {
    type: 'rules';
    defs: Record<string, Rule>;
    refs: RuleRef[];
    first: string | null;
}

// ---- Union of all AST nodes ----

export type ASTNode =
    | Prose
    | CaseInsensitiveString
    | CaseSensitiveString
    | RuleRef
    | Concatenation
    | Alternation
    | Repetition
    | Range
    | Group;
