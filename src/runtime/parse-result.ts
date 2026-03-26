export class ParseError {
    readonly rule: string;
    readonly offset: number;
    readonly expected: string;
    readonly actual: string;
    readonly children: ParseError[];

    constructor(
        rule: string,
        offset: number,
        expected: string,
        actual: string,
        children: ParseError[] = [],
    ) {
        this.rule = rule;
        this.offset = offset;
        this.expected = expected;
        this.actual = actual;
        this.children = children;
    }

    toString(): string {
        const loc = `offset ${this.offset}`;
        const msg = `ParseError in rule "${this.rule}" at ${loc}: expected ${this.expected}, got ${this.actual}`;
        if (this.children.length === 0) return msg;
        const nested = this.children.map(c => '  ' + c.toString()).join('\n');
        return `${msg}\n${nested}`;
    }
}

export interface ParseSuccess<T> {
    readonly success: true;
    readonly value: T;
    /** The offset in the input string after the matched portion. */
    readonly nextOffset: number;
}

export interface ParseFailure {
    readonly success: false;
    readonly error: ParseError;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export function success<T>(value: T, nextOffset: number): ParseSuccess<T> {
    return { success: true, value, nextOffset };
}

export function failure(
    rule: string,
    offset: number,
    expected: string,
    actual: string,
    children: ParseError[] = [],
): ParseFailure {
    return { success: false, error: new ParseError(rule, offset, expected, actual, children) };
}
