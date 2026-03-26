#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFile, readString, validateRefs } from './reader/index.js';
import { analyze } from './analyzer/index.js';
import { generate } from './codegen/index.js';
import type { Rules } from './reader/types.js';

interface CliArgs {
    inputs: string[];
    output: string;
}

function parseArgs(argv: string[]): CliArgs {
    const args = argv.slice(2);
    const inputs: string[] = [];
    let output = 'src/generated';

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--input':
            case '-i':
                i++;
                if (i < args.length) inputs.push(args[i]);
                break;
            case '--output':
            case '-o':
                i++;
                if (i < args.length) output = args[i];
                break;
            case '--help':
            case '-h':
                printUsage();
                process.exit(0);
                break;
            default:
                // Treat as input file
                inputs.push(args[i]);
                break;
        }
    }

    if (inputs.length === 0) {
        console.error('Error: No input files specified.');
        printUsage();
        process.exit(1);
    }

    return { inputs, output };
}

function printUsage(): void {
    console.log(`
Usage: abnf-codegen [options] <input-files...>

Options:
  -i, --input <file>    Input .abnf file (can be specified multiple times)
  -o, --output <dir>    Output directory for generated code (default: src/generated)
  -h, --help            Show this help message

Examples:
  abnf-codegen grammars/core.abnf -o src/generated
  abnf-codegen -i grammars/core.abnf -i grammars/sip.abnf -o src/generated
`);
}

function mergeRules(files: string[]): Rules {
    // Parse first file as base
    let merged = readFile(files[0]);

    // Merge subsequent files
    for (let i = 1; i < files.length; i++) {
        const additional = readFile(files[i]);
        for (const [name, rule] of Object.entries(additional.defs)) {
            if (!(name in merged.defs)) {
                (merged.defs as any)[name] = rule;
            }
        }
        for (const ref of additional.refs) {
            (merged.refs as any[]).push(ref);
        }
    }

    return merged;
}

function main(): void {
    const { inputs, output } = parseArgs(process.argv);

    // Resolve input file paths
    const resolvedInputs = inputs.map(f => path.resolve(f));
    for (const f of resolvedInputs) {
        if (!fs.existsSync(f)) {
            console.error(`Error: Input file not found: ${f}`);
            process.exit(1);
        }
    }

    console.log(`Reading ${resolvedInputs.length} ABNF file(s)...`);
    const rules = mergeRules(resolvedInputs);

    // Validate references
    const refErrors = validateRefs(rules);
    if (refErrors) {
        console.error('Reference errors:');
        for (const err of refErrors) {
            console.error(`  ${err}`);
        }
        process.exit(1);
    }

    console.log(`Analyzing ${Object.keys(rules.defs).length} rules...`);
    const analyzed = analyze(rules);

    console.log(`Generating TypeScript code...`);
    const files = generate(analyzed);

    // Write output
    const outDir = path.resolve(output);
    fs.mkdirSync(outDir, { recursive: true });

    for (const file of files) {
        const filePath = path.join(outDir, file.filename);
        fs.writeFileSync(filePath, file.content, 'utf-8');
        console.log(`  ${filePath}`);
    }

    console.log(`\nGenerated ${files.length} files in ${outDir}`);
}

main();
