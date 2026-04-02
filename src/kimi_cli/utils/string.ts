/**
 * String utilities — corresponds to Python utils/string.py
 */

const NEWLINE_RE = /[\r\n]+/g;

/**
 * Shorten text by inserting ellipsis in the middle.
 */
export function shortenMiddle(text: string, width: number, removeNewline = true): string {
  if (text.length <= width) return text;
  let t = text;
  if (removeNewline) {
    t = t.replace(NEWLINE_RE, " ");
  }
  const half = Math.floor(width / 2);
  return t.slice(0, half) + "..." + t.slice(-half);
}

/**
 * Generate a random lowercase string of fixed length.
 */
export function randomString(length = 8): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += letters[Math.floor(Math.random() * letters.length)];
  }
  return result;
}
