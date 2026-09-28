import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The store's single source of truth for its WhatsApp number.
 * Every WhatsApp entry point (checkout, floating button, quick chat) reads this,
 * so a number saved in the admin panel is used everywhere instead of the
 * previously duplicated hardcoded values that could drift apart.
 */
export const DEFAULT_WHATSAPP_NUMBER = "201140971703";

/**
 * Convert any Egyptian phone format into the international form `wa.me` expects:
 * digits only, country code 20, no leading zero.
 *
 *   01140971703  -> 201140971703        (local)
 *   201140971703 -> 201140971703        (already international)
 *   1140971703   -> 201140971703        (local without the 0)
 *   +20 114 097 1703 -> 201140971703    (spaced / plus form)
 *
 * Returns null when the value is not a usable Egyptian number, so callers can
 * surface a real error instead of silently building a dead wa.me link.
 */
export function toWhatsappNumber(value?: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;

  // "+20 114 097 1703" and "0020 114 097 1703" both arrive with extra prefixes.
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("20")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // An Egyptian mobile is 10 national digits (1 + operator digit + 8 digits).
  if (digits.length !== 10) return null;
  if (!/^1[0125]\d{8}$/.test(digits)) return null;

  return `20${digits}`;
}

/**
 * Get the WhatsApp number that receives store messages.
 *
 * The FIRST valid number in the list is the primary one and always wins, so the
 * admin can control exactly where orders arrive by putting their number at the
 * top. Any further numbers are kept only as a fallback, and are used one at a
 * time only if the primary is missing or invalid.
 */
export function getActiveWhatsappNumber(numbers?: string[]): string {
  const validNumbers = (numbers || [])
    .map(toWhatsappNumber)
    .filter((n): n is string => Boolean(n));

  if (!validNumbers.length) return DEFAULT_WHATSAPP_NUMBER;
  return validNumbers[0];
}

/** Build a wa.me deep link with a pre-filled message. */
export function buildWhatsappLink(phone: string | null | undefined, message: string): string {
  return `https://wa.me/${getActiveWhatsappNumber(phone ? [phone] : undefined)}?text=${encodeURIComponent(message)}`;
}
