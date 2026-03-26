import type { Rules, Rule, ASTNode, RuleRef } from '../reader/types.js';

/**
 * Build a dependency graph from a Rules AST.
 * Nodes are rule names (uppercase). Edges are rule → referenced rules.
 */
export interface DependencyGraph {
    /** Map from uppercase rule name to the set of rule names it references. */
    edges: Map<string, Set<string>>;
    /** Topologically sorted rule names (dependents after dependencies). */
    sorted: string[];
    /** Groups of rule names that form cycles (mutually recursive). */
    cycles: string[][];
}

/**
 * Collect all rule references from an AST node, recursively.
 */
function collectRefs(node: ASTNode, refs: Set<string>): void {
    switch (node.type) {
        case 'ruleref':
            refs.add(node.name.toUpperCase());
            break;
        case 'alternation':
            for (const alt of node.alts) collectRefs(alt, refs);
            break;
        case 'concatenation':
            for (const el of node.elements) collectRefs(el, refs);
            break;
        case 'repetition':
            collectRefs(node.el, refs);
            break;
        case 'group':
            collectRefs(node.alt, refs);
            break;
        // Leaf nodes (prose, strings, ranges) have no references
        default:
            break;
    }
}

/**
 * Build the dependency graph from a parsed ABNF Rules AST.
 */
export function buildDependencyGraph(rules: Rules): DependencyGraph {
    const edges = new Map<string, Set<string>>();

    // Build adjacency list
    for (const [name, rule] of Object.entries(rules.defs)) {
        const refs = new Set<string>();
        collectRefs(rule.def, refs);
        edges.set(name, refs);
    }

    // Tarjan's SCC for cycle detection + topological ordering
    const { sorted, cycles } = tarjanSCC(edges);

    return { edges, sorted, cycles };
}

interface TarjanState {
    index: number;
    lowlink: number;
    onStack: boolean;
}

function tarjanSCC(edges: Map<string, Set<string>>): { sorted: string[]; cycles: string[][] } {
    let nextIndex = 0;
    const state = new Map<string, TarjanState>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    function strongconnect(v: string): void {
        const vState: TarjanState = { index: nextIndex, lowlink: nextIndex, onStack: true };
        state.set(v, vState);
        nextIndex++;
        stack.push(v);

        const neighbors = edges.get(v);
        if (neighbors) {
            for (const w of neighbors) {
                // Only consider nodes that are actually defined rules
                if (!edges.has(w)) continue;
                const wState = state.get(w);
                if (!wState) {
                    strongconnect(w);
                    vState.lowlink = Math.min(vState.lowlink, state.get(w)!.lowlink);
                } else if (wState.onStack) {
                    vState.lowlink = Math.min(vState.lowlink, wState.index);
                }
            }
        }

        if (vState.lowlink === vState.index) {
            const scc: string[] = [];
            let w: string;
            do {
                w = stack.pop()!;
                state.get(w)!.onStack = false;
                scc.push(w);
            } while (w !== v);
            sccs.push(scc);
        }
    }

    for (const v of edges.keys()) {
        if (!state.has(v)) {
            strongconnect(v);
        }
    }

    // SCCs come out in topological order (dependencies first) from Tarjan's
    const sorted = sccs.flat();

    // Cycles are SCCs with more than one node, or a single node referencing itself
    const cycles = sccs.filter(scc => {
        if (scc.length > 1) return true;
        const self = scc[0];
        return edges.get(self)?.has(self) ?? false;
    });

    return { sorted, cycles };
}
