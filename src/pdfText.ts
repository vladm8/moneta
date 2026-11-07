// PDF streams need not store text in reading order. Reconstruct visual rows.
export function pdfTextLines(
  items: Array<{ str: string; transform: number[]; height: number }>,
): string {
  const lines: { y: number; tolerance: number; items: typeof items }[] = [];
  for (const item of [...items].sort(
    (a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  )) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    const tolerance = Math.max(1, Math.min(3, Math.abs(item.height) * 0.25));
    const line = lines.find(
      (l) => Math.abs(l.y - y) <= Math.min(l.tolerance, tolerance),
    );
    if (line) line.items.push(item);
    else lines.push({ y, tolerance, items: [item] });
  }
  return lines
    .map((line) =>
      line.items
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join(" "),
    )
    .join("\n");
}
