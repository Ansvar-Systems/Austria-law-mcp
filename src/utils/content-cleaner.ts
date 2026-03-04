/**
 * Provision content cleaner for Austrian Law MCP.
 *
 * The RIS OGD API returns provision content with embedded metadata (BGBl references,
 * NOR numbers, Gesetzesnummern, classification indexes, dates, keywords). This module
 * strips that metadata so agents receive clean legal text.
 *
 * Applied at query time — the raw DB content is preserved unchanged.
 */

/**
 * Metadata patterns found in RIS provision content.
 * These match FULL lines that are entirely metadata.
 */
const METADATA_LINE_PATTERNS: RegExp[] = [
  // BGBl/JGS/StGBl source references (BGBl. Nr., BGBl. I Nr., BGBl. II Nr., BGBl. III Nr.)
  /^(?:BGBl\.?\s*(?:(?:[IVX]+\s+)?Nr\.)\s*.+|JGS\s+Nr\.\s*.+|StGBl\.?\s*(?:Nr\.)?\s*.+)$/,

  // Document type abbreviation line (BG, BVG, V, StF, etc.)
  /^(?:BG|BVG|V|StF|GZ|Vertrag\s+–\s+.+)$/,

  // Standalone section reference that duplicates the section column
  /^(?:§\s*\d+\w*|Art\.?\s*\d+\w*|Anl\.?\s*\d+\w*)$/,

  // RIS classification index (e.g. "32/01 Finanzverfahren, allgemeines Abgabenrecht")
  /^\d{2}\/\d{2}\s+[A-ZÄÖÜ].+$/,

  // Short name line when it's alone (e.g. "BAO", "ASVG", "B-VG")
  /^[A-ZÄÖÜ][A-ZÄÖÜa-zäöü\-]{0,8}$/,

  // NOR number (e.g. "NOR40217471")
  /^NOR\d+$/,

  // Internal RIS ID (e.g. "N1193018808R", "N6195545424L")
  /^N\d{5,}[A-Z]$/,

  // Standalone Gesetzesnummer (7-8 digit number)
  /^\d{7,8}$/,

  // Standalone date (DD.MM.YYYY)
  /^\d{2}\.\d{2}\.\d{4}$/,

  // Amendment/keyword line ending with a BGBl reference
  /^.{0,60},\s*BGBl\.?\s*(?:Nr\.|I\s+Nr\.)\s*\d+.*$/,

  // Chapter/section structural markers (e.g. "Erstes Hauptstück.", "Allgemeine Bestimmungen.")
  /^(?:Erst|Zweit|Dritt|Viert|Fünft|Sechst|Siebent|Acht|Neunt|Zehnt)(?:e[sr]?)\s+(?:Haupt(?:stück|teil)|Abschnitt|Teil|Buch)\.?$/i,
];

/**
 * RIS Schlagwörter (index keywords) pattern.
 * Comma-separated list of short legal terms, typically 2-8 items, no verbs/sentences.
 * Also matches continuation lines (ending with comma) from multi-line keyword blocks.
 */
const KEYWORD_LINE_PATTERN = /^(?:[A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß\s\-]*,\s*){2,}[A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß\s\-]*,?$/;

/**
 * Trailing section reference appended to the last content line.
 * E.g. "...in demselben aus. § 1." or "...vom Volk aus. Artikel 1."
 */
const TRAILING_SECTION_REF = /\s+(?:§\s*\d+\w*|Artikel\s*\d+\w*)\.?\s*$/;

/**
 * Heuristic: is this line likely a RIS keyword line (Schlagwörter)?
 * Keywords are comma-separated short terms (no sentence structure).
 */
function isKeywordLine(line: string): boolean {
  // Must match the keyword pattern
  if (!KEYWORD_LINE_PATTERN.test(line)) return false;

  // Keywords are short: individual terms are typically < 40 chars
  const terms = line.split(',').map(t => t.trim());
  if (terms.some(t => t.length > 40)) return false;

  // Legal text has sentence-like structure; keywords don't
  // If line contains verbs or articles starting a clause, it's likely content
  if (/\b(?:ist|sind|wird|werden|hat|haben|kann|können|soll|sollen|darf|dürfen|muss|müssen|gemäß|nach|durch|auf|über|bei|unter)\b/i.test(line)) {
    return false;
  }

  return true;
}

/**
 * Clean provision content by removing embedded RIS metadata.
 * Returns cleaned text suitable for agent consumption.
 */
export function cleanProvisionContent(content: string): string {
  let lines = content.split('\n');

  // Pass 1: Remove lines matching definite metadata patterns
  lines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !METADATA_LINE_PATTERNS.some(pattern => pattern.test(trimmed));
  });

  // Pass 2: Remove trailing keyword lines (work backwards from end)
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (isKeywordLine(last)) {
      lines.pop();
    } else {
      break;
    }
  }

  let cleaned = lines.join('\n').trim();

  // Remove trailing section reference from last line
  cleaned = cleaned.replace(TRAILING_SECTION_REF, '');

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
