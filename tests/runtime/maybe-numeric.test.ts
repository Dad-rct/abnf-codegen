import { describe, it, expect } from 'vitest';
import { MaybeNumeric, NumericConversionError } from '../../src/runtime/maybe-numeric.js';

describe('MaybeNumeric', () => {
    describe('toString()', () => {
        it('returns the original raw string', () => {
            expect(new MaybeNumeric('42').toString()).toBe('42');
        });

        it('preserves leading zeros', () => {
            expect(new MaybeNumeric('007').toString()).toBe('007');
        });

        it('preserves whitespace', () => {
            expect(new MaybeNumeric(' 5 ').toString()).toBe(' 5 ');
        });
    });

    describe('asNumber()', () => {
        it('converts a simple integer string', () => {
            expect(new MaybeNumeric('42').asNumber()).toBe(42);
        });

        it('converts a decimal string', () => {
            expect(new MaybeNumeric('3.14').asNumber()).toBe(3.14);
        });

        it('converts a negative number', () => {
            expect(new MaybeNumeric('-100').asNumber()).toBe(-100);
        });

        it('converts a string with leading zeros', () => {
            expect(new MaybeNumeric('007').asNumber()).toBe(7);
        });

        it('throws on empty string', () => {
            expect(() => new MaybeNumeric('').asNumber())
                .toThrow(NumericConversionError);
        });

        it('throws on non-numeric string', () => {
            expect(() => new MaybeNumeric('abc').asNumber())
                .toThrow(NumericConversionError);
        });

        it('throws on Infinity', () => {
            expect(() => new MaybeNumeric('Infinity').asNumber())
                .toThrow(NumericConversionError);
        });

        it('throws on NaN string', () => {
            expect(() => new MaybeNumeric('NaN').asNumber())
                .toThrow(NumericConversionError);
        });
    });

    describe('asInteger()', () => {
        it('converts a simple integer string', () => {
            expect(new MaybeNumeric('255').asInteger()).toBe(255);
        });

        it('converts zero', () => {
            expect(new MaybeNumeric('0').asInteger()).toBe(0);
        });

        it('converts negative integer', () => {
            expect(new MaybeNumeric('-1').asInteger()).toBe(-1);
        });

        it('throws on decimal value', () => {
            expect(() => new MaybeNumeric('3.14').asInteger())
                .toThrow(NumericConversionError);
        });

        it('throws on value exceeding safe integer range', () => {
            const huge = String(Number.MAX_SAFE_INTEGER + 10);
            expect(() => new MaybeNumeric(huge).asInteger())
                .toThrow(NumericConversionError);
        });

        it('throws on non-numeric string', () => {
            expect(() => new MaybeNumeric('hello').asInteger())
                .toThrow(NumericConversionError);
        });
    });

    describe('raw preservation', () => {
        it('raw property matches constructor input', () => {
            const mn = new MaybeNumeric('070');
            expect(mn.raw).toBe('070');
        });
    });
});
