import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get a random WhatsApp number from the list for load balancing
 * If multiple numbers are provided, rotates through them based on timestamp
 */
export function getActiveWhatsappNumber(numbers?: string[]): string {
  const defaultNumber = "201140971703";
  if (!numbers?.length) return defaultNumber;

  // wa.me needs an international number without the local leading zero.
  const normalizeForWhatsapp = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("20") && digits.length === 12) return digits;
    if (digits.startsWith("0") && digits.length === 11) return `20${digits.slice(1)}`;
    if (digits.startsWith("1") && digits.length === 10) return `20${digits}`;
    return digits;
  };
  const validNumbers = numbers.map(normalizeForWhatsapp).filter(Boolean);
  if (!validNumbers.length) return defaultNumber;
  if (validNumbers.length === 1) return validNumbers[0];

  const index = Math.floor(Date.now() / 1000) % validNumbers.length;
  return validNumbers[index];
}
