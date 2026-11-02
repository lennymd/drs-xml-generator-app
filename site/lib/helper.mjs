// A cell or setting as a trimmed string. Empty cells and missing values become ''.
export function text(value) {
  return String(value ?? '').trim();
}

// Make text safe inside XML. A title like "Care & repair" would otherwise break the file.
export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// 6 → '06'. Crossref wants two-digit days and months.
export function pad(number) {
  return String(number).padStart(2, '0');
}

// Adds two spaces per level, like lxml's pretty_print.
export function indent(lines) {
  let depth = 0;
  return lines.map(line => {
    if (line.startsWith('</')) depth--;
    const indented = '  '.repeat(depth) + line;
    const opensOnly =
      line.startsWith('<') &&
      !line.startsWith('</') &&
      !line.startsWith('<?') &&
      !line.endsWith('/>') &&
      !line.includes('</');
    if (opensOnly) depth++;
    return indented;
  });
}

// 2026-11-02 16:48:55 → '20261102164855'
export function stamp(now) {
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}
