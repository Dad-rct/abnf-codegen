/**
 * Wraps a raw string that may represent a numeric value.
 * Preserves the original text for reversible parse/build round-trips.
 * Semantic accessors (.asNumber(), .asInteger()) throw on unsafe conversions.
 */
export class MaybeNumeric {
    readonly raw: string;

    constructor(raw: string) {
        this.raw = raw;
    }

    toString(): string {
        return this.raw;
    }

    /**
     * Attempt to interpret the raw string as a floating-point number.
     * Throws if the string is empty, not a valid number, or the result
     * is not finite.
     */
    asNumber(): number {
        if (this.raw.length === 0) {
            throw new NumericConversionError(this.raw, 'Cannot convert empty string to number');
        }
        const n = Number(this.raw);
        if (!Number.isFinite(n)) {
            throw new NumericConversionError(this.raw, `"${this.raw}" is not a finite number`);
        }
        return n;
    }

    /**
     * Attempt to interpret the raw string as a safe integer.
     * Throws if the value is not an integer or exceeds Number.MAX_SAFE_INTEGER.
     */
    asInteger(): number {
        const n = this.asNumber();
        if (!Number.isInteger(n)) {
            throw new NumericConversionError(this.raw, `"${this.raw}" is not an integer`);
        }
        if (!Number.isSafeInteger(n)) {
            throw new NumericConversionError(this.raw, `"${this.raw}" exceeds safe integer range`);
        }
        return n;
    }
}

export class NumericConversionError extends Error {
    readonly raw: string;

    constructor(raw: string, message: string) {
        super(message);
        this.name = 'NumericConversionError';
        this.raw = raw;
    }
}
