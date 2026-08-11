import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional class names, with later Tailwind utilities beating earlier ones.
 * Without the merge, `cn("px-4", "px-6")` would emit both and leave the winner
 * to stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
