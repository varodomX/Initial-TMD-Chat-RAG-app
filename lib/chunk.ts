export function chunkText(text: string, maxChars = 1200, overlap = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + maxChars, clean.length);
    chunks.push(clean.slice(start, end).trim());

    if (end === clean.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}
