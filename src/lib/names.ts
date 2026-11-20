/**
 * How to address someone by name in a sentence or a greeting.
 *
 * Usually the first word ("Sarah Jones" → "Sarah"). But plenty of customers
 * are entered the way they introduce themselves on the phone — "Mr David",
 * "Mrs Patel" — and taking the first word of those gave "Hello Mr," in emails
 * and "Mr can already sign in" on screen. With a title, keep it with the
 * surname: "Mr David", "Mrs Patel".
 */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "rev", "sir", "dame", "lady", "lord"]);

export function addressName(fullName: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const first = words[0]!.replace(/\.$/, "").toLowerCase();
  if (TITLES.has(first)) {
    return words.length > 1 ? `${words[0]} ${words[words.length - 1]}` : words[0]!;
  }

  return words[0]!;
}
