export function normalizeEgyptianPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("1") && digits.length === 10) return `0${digits}`;
  return digits;
}

export function isValidEgyptianPhone(value: string): boolean {
  return /^01[0125]\d{8}$/.test(normalizeEgyptianPhone(value));
}

export function cleanUserText(value: string, maxLength: number): string {
  return value.replace(/[<>]/g, "").split("").filter((char) => {
    const code = char.charCodeAt(0);
    return code > 31 && code !== 127;
  }).join("").trim().slice(0, maxLength);
}

export function isValidOrderQuantity(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 100;
}
