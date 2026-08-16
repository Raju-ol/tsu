/**
 * Sanitizes and strips HTML tags to prevent XSS injection.
 */
export function stripHtml(str: string): string {
  if (!str) return "";
  // Strip any HTML tags (<tag>, <script>, etc.)
  return str.replace(/<[^>]*>/g, "").trim();
}

/**
 * Validates and sanitizes a nickname.
 * Trims whitespace, strips HTML tags, caps length at 20 chars.
 * Defaults to "Anonymous" if empty after stripping.
 */
export function sanitizeNickname(input?: string): string {
  if (!input) return "Anonymous";
  const stripped = stripHtml(input);
  if (!stripped) return "Anonymous";
  return stripped.slice(0, 20);
}

/**
 * Validates and sanitizes an optional room name.
 * Trims whitespace, strips HTML tags, caps length at 30 chars.
 */
export function sanitizeRoomName(input?: string): string | undefined {
  if (!input) return undefined;
  const stripped = stripHtml(input);
  if (!stripped) return undefined;
  return stripped.slice(0, 30);
}

/**
 * Validates and sanitizes a room code.
 * Room code must be exactly 6 uppercase alphanumeric characters.
 */
export function isValidRoomCodeFormat(code?: string): boolean {
  if (!code) return false;
  const cleanCode = code.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(cleanCode);
}

/**
 * Validates and sanitizes chat message text.
 * Trims whitespace, strips HTML tags, caps at 1000 characters.
 * Returns null if invalid or empty.
 */
export function sanitizeMessage(input?: string): string | null {
  if (!input) return null;
  const stripped = stripHtml(input);
  if (!stripped) return null;
  return stripped.slice(0, 1000);
}
