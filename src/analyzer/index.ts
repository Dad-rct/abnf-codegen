import type { Rules, Rule, ASTNode } from '../reader/types.js';
import { buildDependencyGraph, type DependencyGraph } from './dependency-graph.js';
import { detectNumericPattern, type NumericPattern } from './pattern-detector.js';

export { type DependencyGraph } from './dependency-graph.js';
export { type NumericPattern } from './pattern-detector.js';

/**
 * Intermediate representation of an analyzed ABNF grammar.
 */
export interface AnalyzedGrammar {
    /** Original parsed rules */
    rules: Rules;
    /** Dependency graph with topological ordering and cycles */
    graph: DependencyGraph;
    /** Per-rule analysis results, keyed by uppercase rule name */
    ruleAnalysis: Map<string, RuleAnalysis>;
}

export interface RuleAnalysis {
    /** Uppercase rule name */
    name: string;
    /** Original case rule name */
    originalName: string;
    /** The rule's AST definition */
    def: ASTNode;
    /** Rules this rule directly references */
    references: Set<string>;
    /** Whether this rule is part of a cycle (needs lazy resolution) */
    isCyclic: boolean;
    /** Detected numeric pattern, if any */
    numericPattern: NumericPattern;
    /** Inferred TypeScript type category */
    typeCategory: TypeCategory;
}

export type TypeCategory =
    | 'literal'      // fixed string literal(s)
    | 'alternation'  // union of sub-types
    | 'concatenation' // sequence of fields
    | 'repetition'   // array of sub-type
    | 'numeric'      // MaybeNumeric
    | 'range'        // single char from range
    | 'reference'    // delegates to another rule
    | 'group'        // grouped expression
    | 'prose';       // prose description (opaque string)

/**
 * Analyze a parsed ABNF grammar, producing an enriched IR suitable for code generation.
 */
export function analyze(rules: Rules): AnalyzedGrammar {
    const graph = buildDependencyGraph(rules);

    // Build a set of all rule names in cycles
    const cyclicRules = new Set<string>();
    for (const cycle of graph.cycles) {
        for (const name of cycle) {
            cyclicRules.add(name);
        }
    }

    const ruleAnalysis = new Map<string, RuleAnalysis>();

    for (const name of graph.sorted) {
        const rule = rules.defs[name];
        if (!rule) continue;

        const numericPattern = detectNumericPattern(rule.def);
        const typeCategory = inferTypeCategory(rule.def, numericPattern);

        ruleAnalysis.set(name, {
            name,
            originalName: rule.name,
            def: rule.def,
            references: graph.edges.get(name) ?? new Set(),
            isCyclic: cyclicRules.has(name),
            numericPattern,
            typeCategory,
        });
    }

    return { rules, graph, ruleAnalysis };
}

function inferTypeCategory(node: ASTNode, numericPattern: NumericPattern): TypeCategory {
    if (numericPattern.isNumeric) return 'numeric';

    switch (node.type) {
        case 'caseInsensitveString':
        case 'caseSensitveString':
            return 'literal';
        case 'alternation':
            return 'alternation';
        case 'concatenation':
            return 'concatenation';
        case 'repetition':
            return 'repetition';
        case 'range':
            return 'range';
        case 'ruleref':
            return 'reference';
        case 'group':
            return 'group';
        case 'prose':
            return 'prose';
        default:
            return 'literal';
    }
}
