export function normalizeProjectText(value: string) {
  const words = value.trim().replace(/\s+/g, " ").split(" ");
  const normalized: string[] = [];
  for (const word of words) {
    if (
      word &&
      word.toLocaleLowerCase() !== normalized.at(-1)?.toLocaleLowerCase()
    )
      normalized.push(word);
  }
  return normalized.join(" ");
}
