/**
 * Path utilities — corresponds to Python utils/path.py
 */

import { homedir } from "node:os";
import { resolve, relative, join } from "node:path";

/** Expand ~ to home directory. */
export function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/** Resolve a path relative to a base directory, expanding ~. */
export function resolvePath(base: string, p: string): string {
  return resolve(base, expandHome(p));
}

/** Get a relative path from base, or the absolute path if it's shorter. */
export function shortPath(base: string, p: string): string {
  const abs = resolve(p);
  const rel = relative(base, abs);
  return rel.length < abs.length ? rel : abs;
}

/** Check if a path is inside a directory. */
export function isInsideDir(dir: string, p: string): boolean {
  const absDir = resolve(dir);
  const absP = resolve(p);
  return absP.startsWith(absDir + "/") || absP === absDir;
}

/** Ensure a directory exists. */
export async function ensureDir(dir: string): Promise<void> {
  await Bun.$`mkdir -p ${dir}`.quiet();
}
