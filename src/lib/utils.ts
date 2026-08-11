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
  // Default fallback number
  const defaultNumber = "201122310891";
  
  if (!numbers || numbers.length === 0) {
    return defaultNumber;
  }

  if (numbers.length === 1) {
    return numbers[0];
  }

  // Use timestamp-based rotation for smooth distribution
  const now = Date.now();
  const index = Math.floor((now / 1000) % numbers.length); // Cycle every second
  return numbers[index];
}
