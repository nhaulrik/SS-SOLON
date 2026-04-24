import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(__dirname, 'projects');
export const RESOLVED_PROJECTS_DIR = path.resolve(PROJECTS_DIR);

export const SLICE_TEMPLATES_DIR = path.join(__dirname, 'templates', 'slice-output');

/** Returns true only when `filePath` is strictly inside `resolvedBase`. */
export function isInsideDir(filePath, resolvedBase) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;
}
