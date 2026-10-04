import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ARABIC_INDIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/**
 * Converts a Western-digit number string to Arabic-Indic digits.
 * Mixing Western digits directly into an Arabic (RTL) text node causes
 * Unicode bidi reordering artifacts (e.g. "الادعاء 01" rendering reversed).
 * Using Arabic-Indic digits keeps the whole label in one script/direction.
 */
export function toArabicDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}
