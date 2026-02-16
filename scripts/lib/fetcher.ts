/**
 * RIS OGD API v2.6 client for Austrian federal legislation.
 *
 * Base: https://data.bka.gv.at/ris/api/v2.6/Bundesrecht
 * Params: Applikation=BrKons (consolidated federal law)
 * Pagination: DokumenteProSeite=OneHundred + Seitennummer={N}
 * Content: https://www.ris.bka.gv.at/Dokumente/Bundesnormen/{ID}/{ID}.xml
 *
 * No authentication required. Rate limit: 300ms between requests.
 */

const BASE_URL = 'https://data.bka.gv.at/ris/api/v2.6/Bundesrecht';
const CONTENT_BASE = 'https://www.ris.bka.gv.at/Dokumente/Bundesnormen';
const RATE_LIMIT_MS = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RISDocumentMeta {
  /** Unique document ID, e.g. "NOR40152359" */
  id: string;
  /** Law identifier number, e.g. "10001848" */
  gesetzesnummer: string;
  /** Provision reference, e.g. "§ 1", "Art. 1", "Anl. 1" */
  artikelParagraphAnlage: string;
  /** Short title, e.g. "Datenschutzgesetz" */
  kurztitel: string;
  /** Full title with publication details */
  titel: string;
  /** Document type: "BG" (Bundesgesetz), "V" (Verordnung), "K", "Vertrag", etc. */
  typ: string;
  /** Entry into force date */
  inkrafttretensdatum: string | null;
  /** Exit from force date (null if still in force) */
  ausserkrafttretensdatum: string | null;
  /** Direct URL to the document page */
  dokumentUrl: string;
  /** URL for XML content */
  xmlUrl: string | null;
}

export interface RISSearchResult {
  totalHits: number;
  pageNumber: number;
  pageSize: number;
  documents: RISDocumentMeta[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to safely navigate deeply nested JSON
// ─────────────────────────────────────────────────────────────────────────────

function dig(obj: unknown, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function str(val: unknown): string {
  if (val == null) return '';
  return String(val).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// API methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single page of consolidated federal law results.
 */
export async function fetchPage(pageNumber: number): Promise<RISSearchResult> {
  const url = `${BASE_URL}?Applikation=BrKons&DokumenteProSeite=OneHundred&Seitennummer=${pageNumber}`;
  const response = await rateLimitedFetch(url);
  const json = await response.json();

  const hits = dig(json, 'OgdSearchResult', 'OgdDocumentResults', 'Hits');
  const totalHits = parseInt(str(dig(hits, '#text')) || '0', 10);
  const pageNum = parseInt(str(dig(hits, '@pageNumber')) || '1', 10);
  const pageSize = parseInt(str(dig(hits, '@pageSize')) || '100', 10);

  const refs = dig(json, 'OgdSearchResult', 'OgdDocumentResults', 'OgdDocumentReference');
  const refArray = Array.isArray(refs) ? refs : refs ? [refs] : [];

  const documents: RISDocumentMeta[] = refArray.map((ref: unknown) => {
    const data = dig(ref, 'Data');
    const meta = dig(data, 'Metadaten');
    const technisch = dig(meta, 'Technisch');
    const bundesrecht = dig(meta, 'Bundesrecht');
    const brKons = dig(bundesrecht, 'BrKons');
    const allgemein = dig(meta, 'Allgemein');

    // Extract XML URL from content URLs
    const contentRefs = dig(data, 'Dokumentliste', 'ContentReference');
    const contentRefArray = Array.isArray(contentRefs) ? contentRefs : contentRefs ? [contentRefs] : [];

    let xmlUrl: string | null = null;
    for (const cr of contentRefArray) {
      const urls = dig(cr, 'Urls', 'ContentUrl');
      const urlArray = Array.isArray(urls) ? urls : urls ? [urls] : [];
      for (const u of urlArray) {
        if (str(dig(u, 'DataType')) === 'Xml') {
          xmlUrl = str(dig(u, 'Url')) || null;
          break;
        }
      }
      if (xmlUrl) break;
    }

    const id = str(dig(technisch, 'ID'));

    // Fallback: construct XML URL from ID if not found in content URLs
    if (!xmlUrl && id) {
      xmlUrl = `${CONTENT_BASE}/${id}/${id}.xml`;
    }

    return {
      id,
      gesetzesnummer: str(dig(brKons, 'Gesetzesnummer')),
      artikelParagraphAnlage: str(dig(brKons, 'ArtikelParagraphAnlage')),
      kurztitel: str(dig(bundesrecht, 'Kurztitel')),
      titel: str(dig(bundesrecht, 'Titel')),
      typ: str(dig(brKons, 'Typ')),
      inkrafttretensdatum: str(dig(brKons, 'Inkrafttretensdatum')) || null,
      ausserkrafttretensdatum: str(dig(brKons, 'Ausserkrafttretensdatum')) || null,
      dokumentUrl: str(dig(allgemein, 'DokumentUrl')),
      xmlUrl,
    };
  });

  return { totalHits, pageNumber: pageNum, pageSize, documents };
}

/**
 * Fetch the raw XML content for a given document ID.
 */
export async function fetchDocumentXml(documentId: string): Promise<string> {
  const url = `${CONTENT_BASE}/${documentId}/${documentId}.xml`;
  const response = await rateLimitedFetch(url);
  return response.text();
}

/**
 * Calculate total pages from total hits.
 */
export function totalPages(totalHits: number, pageSize: number = 100): number {
  return Math.ceil(totalHits / pageSize);
}
