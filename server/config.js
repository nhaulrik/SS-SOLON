import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEMP_DIR    = process.env.TEMP_DIR    || path.join(__dirname, 'temp');
export const OUTPUT_DIR  = process.env.OUTPUT_DIR  || path.join(__dirname, 'output');
export const PATCHES_DIR = process.env.PATCHES_DIR || path.join(__dirname, 'patches');
export const CHAINS_DIR  = process.env.CHAINS_DIR  || path.join(__dirname, 'patch-chains');

export const RESOLVED_OUTPUT_DIR  = path.resolve(OUTPUT_DIR);
export const RESOLVED_CHAINS_DIR  = path.resolve(CHAINS_DIR);
export const RESOLVED_PATCHES_DIR = path.resolve(PATCHES_DIR);

/** Returns true only when `filePath` is strictly inside `resolvedBase`. */
export function isInsideDir(filePath, resolvedBase) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;
}
