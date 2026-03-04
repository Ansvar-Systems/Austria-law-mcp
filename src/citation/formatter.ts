/**
 * Austrian legal citation formatter.
 *
 * Formats:
 *   full:     "§ 3, Datenschutzgesetz"
 *   short:    "§ 3 DSG"
 *   pinpoint: "§ 3(1)(a)"
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

export function formatCitation(
  parsed: ParsedCitation,
  format: CitationFormat = 'full'
): string {
  if (!parsed.valid || !parsed.section) {
    return '';
  }

  const pinpoint = buildPinpoint(parsed);
  const titleAndYear = [parsed.title, parsed.year ? String(parsed.year) : undefined]
    .filter(Boolean)
    .join(' ');

  switch (format) {
    case 'full':
      return titleAndYear ? `§ ${pinpoint}, ${titleAndYear}` : `§ ${pinpoint}`;

    case 'short':
      return parsed.title ? `§ ${pinpoint} ${parsed.title}` : `§ ${pinpoint}`;

    case 'pinpoint':
      return `§ ${pinpoint}`;

    default:
      return titleAndYear ? `§ ${pinpoint}, ${titleAndYear}` : `§ ${pinpoint}`;
  }
}

function buildPinpoint(parsed: ParsedCitation): string {
  let ref = parsed.section!;
  if (parsed.subsection) {
    ref += `(${parsed.subsection})`;
  }
  if (parsed.paragraph) {
    ref += `(${parsed.paragraph})`;
  }
  return ref;
}
