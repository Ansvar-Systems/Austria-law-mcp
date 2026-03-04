/**
 * Austrian legal citation parser.
 *
 * Parses citations like:
 *   "§ 1, Allgemeines bürgerliches Gesetzbuch"
 *   "§ 5 DSG"
 *   "Allgemeines bürgerliches Gesetzbuch § 1"
 */

import type { ParsedCitation } from '../types/index.js';

// § 1, Title
const SECTION_THEN_TITLE = /^(?:§|Paragraph|Paragraf)\s*([\d]+[a-z]?(?:\(\d+\))*(?:\([a-z]\))?)\s*,?\s+(.+)$/i;
// Title § 1
const TITLE_THEN_SECTION = /^(.+?)\s+(?:§|Paragraph|Paragraf)\s*([\d]+[a-z]?(?:\(\d+\))*(?:\([a-z]\))?)$/i;
// para1, Title
const MACHINE_REF_THEN_TITLE = /^para([\d]+[a-z]?)\s*,?\s+(.+)$/i;
// Legacy support: Section 3, Act 2018 / s. 3 Act 2018
const LEGACY_ENGLISH = /^(?:Section|s\.?)\s+([\d]+[a-z]?(?:\(\d+\))*(?:\([a-z]\))?)\s*,?\s+(.+?)(?:\s+(\d{4}))?$/i;
// Section with subsection: 3(1)(a)
const SECTION_REF = /^(\d+[a-z]?)(?:\((\d+)\))?(?:\(([a-z])\))?$/i;

function splitYear(title: string): { cleanTitle: string; year?: number } {
  const trimmed = title.trim();
  const match = trimmed.match(/\s+(\d{4})$/);
  if (!match?.[1]) {
    return { cleanTitle: trimmed };
  }
  return {
    cleanTitle: trimmed.slice(0, trimmed.length - match[0].length).trim(),
    year: Number.parseInt(match[1], 10),
  };
}

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();
  if (!trimmed) {
    return {
      valid: false,
      type: 'unknown',
      error: 'Empty citation',
    };
  }

  let match = trimmed.match(SECTION_THEN_TITLE);
  if (match?.[1] && match[2]) {
    const section = match[1];
    const { cleanTitle, year } = splitYear(match[2]);
    return parseSection(section, cleanTitle, year, 'statute');
  }

  match = trimmed.match(TITLE_THEN_SECTION);
  if (match?.[1] && match[2]) {
    const { cleanTitle, year } = splitYear(match[1]);
    return parseSection(match[2], cleanTitle, year, 'statute');
  }

  match = trimmed.match(MACHINE_REF_THEN_TITLE);
  if (match?.[1] && match[2]) {
    const { cleanTitle, year } = splitYear(match[2]);
    return parseSection(match[1], cleanTitle, year, 'statute');
  }

  match = trimmed.match(LEGACY_ENGLISH);
  if (match?.[1] && match[2]) {
    const year = match[3] ? Number.parseInt(match[3], 10) : undefined;
    return parseSection(match[1], match[2], year, 'statute');
  }

  if (trimmed.match(/^para[\d]+[a-z]?$/i)) {
    return parseSection(trimmed.slice(4), undefined, undefined, 'statute');
  }

  // Bare section reference ("§ 1")
  match = trimmed.match(/^(?:§|Paragraph|Paragraf)\s*([\d]+[a-z]?(?:\(\d+\))*(?:\([a-z]\))?)$/i);
  if (match) {
    return parseSection(match[1], undefined, undefined, 'statute');
  }

  return {
    valid: false,
    type: 'unknown',
    error: `Could not parse Austrian citation: "${trimmed}"`,
  };
}

function parseSection(
  sectionStr: string,
  title: string | undefined,
  year: number | undefined,
  type: 'statute' | 'statutory_instrument'
): ParsedCitation {
  const normalized = sectionStr.replace(/^para/i, '').trim();
  const sectionMatch = normalized.match(SECTION_REF);

  return {
    valid: true,
    type,
    title: title?.trim(),
    year,
    section: sectionMatch?.[1] ?? normalized,
    subsection: sectionMatch?.[2] ?? undefined,
    paragraph: sectionMatch?.[3] ?? undefined,
  };
}
