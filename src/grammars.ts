import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the bundled grammars directory. */
export const grammarsDir = path.resolve(__dirname, '..', 'grammars');

/** Absolute path to the bundled core.abnf (RFC 5234 Appendix B). */
export const coreAbnfPath = path.join(grammarsDir, 'core.abnf');
