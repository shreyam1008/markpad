// A few small defaults for a local writing app.
export const writing = {
  theme: "system",
  fontSize: 14,
  lineSpacing: "comfortable",
  saveLocally: true,
};

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/);
  return text.trim() ? words.length : 0;
}

export function readingTime(text: string): string {
  const minutes = Math.max(1, Math.ceil(wordCount(text) / 200));
  return `${minutes} min read`;
}
