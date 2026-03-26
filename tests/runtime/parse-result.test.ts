import { describe, it, expect } from 'vitest';
import {
    ParseError,
    success,
    failure,
} from '../../src/runtime/parse-result.js';

describe('ParseResult', () => {
    describe('success()', () => {
        it('creates a success result with value and nextOffset', () => {
            const result = success('matched', 5);
            expect(result.success).toBe(true);
            expect(result.value).toBe('matched');
            expect(result.nextOffset).toBe(5);
        });

        it('works with complex value types', () => {
            const val = { rule: 'test', children: [1, 2] };
            const result = success(val, 10);
            expect(result.success).toBe(true);
            expect(result.value).toStrictEqual(val);
        });
    });

    describe('failure()', () => {
        it('creates a failure result with error details', () => {
            const result = failure('my-rule', 3, '"("', '"x"');
            expect(result.success).toBe(false);
            expect(result.error.rule).toBe('my-rule');
            expect(result.error.offset).toBe(3);
            expect(result.error.expected).toBe('"("');
            expect(result.error.actual).toBe('"x"');
        });

        it('includes child errors for alternations', () => {
            const child1 = new ParseError('alt-1', 3, '"("', '"x"');
            const child2 = new ParseError('alt-2', 3, '")"', '"x"');
            const result = failure('parent', 3, 'one of alternation', '"x"', [child1, child2]);
            expect(result.error.children).toHaveLength(2);
        });
    });

    describe('ParseError', () => {
        it('formats a simple error as string', () => {
            const err = new ParseError('my-rule', 5, '"a"', '"b"');
            const str = err.toString();
            expect(str).toContain('my-rule');
            expect(str).toContain('offset 5');
            expect(str).toContain('"a"');
            expect(str).toContain('"b"');
        });

        it('formats nested errors', () => {
            const child = new ParseError('child-rule', 5, '"x"', '"y"');
            const parent = new ParseError('parent-rule', 5, 'alternation', '"y"', [child]);
            const str = parent.toString();
            expect(str).toContain('parent-rule');
            expect(str).toContain('child-rule');
        });
    });
});
