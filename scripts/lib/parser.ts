/**
 * RISDOK XML parser for Austrian federal legislation.
 *
 * Parses the RISDOK XML format used by the RIS system:
 * - <nutzdaten>/<abschnitt> structure
 * - <absatz typ="abs" ct="text"> for provision text
 * - <ueberschrift typ="titel"> for titles/headings
 * - Handles §, Art., Anl. (Anlage/annex) provision types
 */

import { XMLParser } from 'fast-xml-parser';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedProvision {
  /** Normalized provision reference, e.g. "para1", "art2", "anl1" */
  provision_ref: string;
  /** Display section, e.g. "§ 1", "Art. 2", "Anl. 1" */
  section: string;
  /** Provision title if found */
  title: string | null;
  /** Full text content */
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// XML Parser setup
// ─────────────────────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  isArray: (name: string) => {
    // These elements can appear multiple times
    return ['abschnitt', 'absatz', 'ueberschrift', 'liste', 'aufzaehlung', 'tabelle', 'zeile', 'inhalt'].includes(name);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively extract text content from a parsed XML node.
 * Handles mixed content where text and child elements are interleaved.
 */
function extractText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);

  if (Array.isArray(node)) {
    return node.map(extractText).join(' ');
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const parts: string[] = [];

    // Get direct text content
    if (obj['#text'] != null) {
      parts.push(String(obj['#text']));
    }

    // Recurse into child elements (skip attributes)
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@_') || key === '#text') continue;
      parts.push(extractText(value));
    }

    return parts.join(' ');
  }

  return '';
}

/**
 * Clean extracted text: normalize whitespace, trim.
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Provision reference parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a provision reference like "§ 1", "Art. 2", "Anl. 1" to
 * a machine-friendly format: "para1", "art2", "anl1".
 */
export function normalizeProvisionRef(ref: string): string {
  const trimmed = ref.trim();

  // § N or § Na (e.g. § 5a)
  const paraMatch = trimmed.match(/^§\s*(\d+\w*)/);
  if (paraMatch) return `para${paraMatch[1]}`;

  // Art. N or Art N
  const artMatch = trimmed.match(/^Art\.?\s*(\d+\w*)/i);
  if (artMatch) return `art${artMatch[1]}`;

  // Anl. N or Anlage N
  const anlMatch = trimmed.match(/^(?:Anl\.?|Anlage)\s*(\d+\w*)/i);
  if (anlMatch) return `anl${anlMatch[1]}`;

  // Fallback: sanitize
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse RISDOK XML and extract the provision content.
 *
 * Each XML document represents a single provision (§, Art., Anl.) as returned
 * by the RIS API. The section reference comes from the API metadata, not
 * necessarily from the XML itself.
 */
export function parseRisdokXml(xml: string, sectionRef: string): ParsedProvision | null {
  try {
    const parsed = xmlParser.parse(xml);
    const risdok = parsed?.risdok;
    if (!risdok) return null;

    const nutzdaten = risdok?.nutzdaten;
    if (!nutzdaten) return null;

    // Extract title and content from abschnitt sections
    const abschnitte = Array.isArray(nutzdaten.abschnitt)
      ? nutzdaten.abschnitt
      : nutzdaten.abschnitt
        ? [nutzdaten.abschnitt]
        : [];

    let title: string | null = null;
    const contentParts: string[] = [];

    for (const abschnitt of abschnitte) {
      // Extract headings (ueberschrift elements)
      const headings = Array.isArray(abschnitt.ueberschrift)
        ? abschnitt.ueberschrift
        : abschnitt.ueberschrift
          ? [abschnitt.ueberschrift]
          : [];

      for (const heading of headings) {
        const typ = heading?.['@_typ'] || '';
        if (typ === 'titel' || typ === 'art' || typ === 'para') {
          const text = cleanText(extractText(heading));
          if (text && !title) {
            title = text;
          }
        }
      }

      // Extract paragraph text (absatz elements)
      const paragraphs = Array.isArray(abschnitt.absatz)
        ? abschnitt.absatz
        : abschnitt.absatz
          ? [abschnitt.absatz]
          : [];

      for (const para of paragraphs) {
        const typ = para?.['@_typ'] || '';
        const ct = para?.['@_ct'] || '';

        // Skip structural/metadata paragraphs, keep actual content
        if (typ === 'abs' && (ct === 'text' || ct === '')) {
          const text = cleanText(extractText(para));
          if (text) contentParts.push(text);
        } else if (typ === 'erltext') {
          // erltext can contain titles (kurztitel, langtitel) or content
          if (ct === 'kurztitel' || ct === 'langtitel') {
            const text = cleanText(extractText(para));
            if (text && !title) {
              title = text;
            }
          } else {
            const text = cleanText(extractText(para));
            if (text) contentParts.push(text);
          }
        } else if (typ === 'abs') {
          // Other abs types (e.g. ct="n" for numbered)
          const text = cleanText(extractText(para));
          if (text) contentParts.push(text);
        }
      }

      // Also look for content in liste/aufzaehlung (lists)
      const listen = Array.isArray(abschnitt.liste)
        ? abschnitt.liste
        : abschnitt.liste
          ? [abschnitt.liste]
          : [];

      for (const liste of listen) {
        const text = cleanText(extractText(liste));
        if (text) contentParts.push(text);
      }
    }

    const content = contentParts.join('\n');
    if (!content) return null;

    return {
      provision_ref: normalizeProvisionRef(sectionRef),
      section: sectionRef,
      title,
      content,
    };
  } catch {
    return null;
  }
}
