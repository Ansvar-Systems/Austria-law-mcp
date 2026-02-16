#!/usr/bin/env tsx
/**
 * Two-phase ingestion pipeline for Austrian federal legislation.
 *
 * Phase 1 (Discovery): Paginate through RIS OGD API, build law index.
 * Phase 2 (Content): Fetch XML for each provision, parse, produce seed JSON.
 *
 * Usage:
 *   npm run ingest                     # Full ingestion (VERY SLOW)
 *   npm run ingest -- --limit 2        # First 2 pages (200 provisions)
 *   npm run ingest -- --law 10001848   # Single law by Gesetzesnummer
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchPage, fetchDocumentXml, totalPages, type RISDocumentMeta } from './lib/fetcher.js';
import { parseRisdokXml } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const INDEX_PATH = path.join(SOURCE_DIR, 'law-index.json');

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  limit: number | null;
  law: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let law: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--law' && args[i + 1]) {
      law = args[i + 1];
      i++;
    }
  }

  return { limit, law };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LawIndexEntry {
  gesetzesnummer: string;
  kurztitel: string;
  typ: string;
  provisionCount: number;
  provisions: ProvisionIndexEntry[];
}

interface ProvisionIndexEntry {
  id: string;
  artikelParagraphAnlage: string;
  xmlUrl: string | null;
  inkrafttretensdatum: string | null;
  ausserkrafttretensdatum: string | null;
}

interface SeedDocument {
  id: string;
  type: string;
  title: string;
  short_name: string;
  status: string;
  url: string;
  provisions: SeedProvision[];
}

interface SeedProvision {
  provision_ref: string;
  section: string;
  title: string | null;
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Discovery
// ─────────────────────────────────────────────────────────────────────────────

async function phase1Discovery(args: CliArgs): Promise<Map<string, LawIndexEntry>> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Phase 1: Discovery — Paginating RIS OGD API');
  console.log('═══════════════════════════════════════════════════\n');

  // Check for existing index
  if (fs.existsSync(INDEX_PATH) && !args.limit) {
    console.log(`  Found existing index at ${INDEX_PATH}`);
    const existing = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as LawIndexEntry[];
    const lawMap = new Map<string, LawIndexEntry>();
    for (const entry of existing) {
      lawMap.set(entry.gesetzesnummer, entry);
    }
    console.log(`  Loaded ${lawMap.size} laws from cached index.\n`);
    return lawMap;
  }

  // First request to get total count
  console.log('  Fetching page 1 to determine total scope...');
  const firstResult = await fetchPage(1);
  const total = totalPages(firstResult.totalHits);
  const maxPages = args.limit ? Math.min(args.limit, total) : total;

  console.log(`  Total hits: ${firstResult.totalHits}`);
  console.log(`  Total pages: ${total}`);
  console.log(`  Pages to fetch: ${maxPages}\n`);

  // Build law index from all pages
  const lawMap = new Map<string, LawIndexEntry>();

  // Process first page
  processPageDocuments(firstResult.documents, lawMap);
  console.log(`  Page 1/${maxPages}: ${firstResult.documents.length} documents (${lawMap.size} unique laws so far)`);

  // Fetch remaining pages
  for (let page = 2; page <= maxPages; page++) {
    try {
      const result = await fetchPage(page);
      processPageDocuments(result.documents, lawMap);

      if (page % 10 === 0 || page === maxPages) {
        console.log(`  Page ${page}/${maxPages}: ${result.documents.length} documents (${lawMap.size} unique laws so far)`);
      }
    } catch (error) {
      console.error(`  ERROR on page ${page}: ${error}`);
      // Continue with next page
    }
  }

  // Save index
  const indexData = Array.from(lawMap.values());
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData, null, 2), 'utf-8');
  console.log(`\n  Saved index: ${lawMap.size} laws to ${INDEX_PATH}\n`);

  return lawMap;
}

function processPageDocuments(docs: RISDocumentMeta[], lawMap: Map<string, LawIndexEntry>): void {
  for (const doc of docs) {
    if (!doc.gesetzesnummer) continue;

    let entry = lawMap.get(doc.gesetzesnummer);
    if (!entry) {
      entry = {
        gesetzesnummer: doc.gesetzesnummer,
        kurztitel: doc.kurztitel,
        typ: doc.typ,
        provisionCount: 0,
        provisions: [],
      };
      lawMap.set(doc.gesetzesnummer, entry);
    }

    // Only add provisions with actual section references (skip § 0 which is metadata)
    if (doc.artikelParagraphAnlage && doc.artikelParagraphAnlage !== '§ 0') {
      entry.provisions.push({
        id: doc.id,
        artikelParagraphAnlage: doc.artikelParagraphAnlage,
        xmlUrl: doc.xmlUrl,
        inkrafttretensdatum: doc.inkrafttretensdatum,
        ausserkrafttretensdatum: doc.ausserkrafttretensdatum,
      });
      entry.provisionCount = entry.provisions.length;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Content fetching and seed generation
// ─────────────────────────────────────────────────────────────────────────────

async function phase2Content(lawMap: Map<string, LawIndexEntry>, args: CliArgs): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Phase 2: Content — Fetching XML & Building Seeds');
  console.log('═══════════════════════════════════════════════════\n');

  fs.mkdirSync(SEED_DIR, { recursive: true });

  // Filter to single law if --law flag provided
  let lawEntries = Array.from(lawMap.values());
  if (args.law) {
    lawEntries = lawEntries.filter(e => e.gesetzesnummer === args.law);
    if (lawEntries.length === 0) {
      console.error(`  No law found with Gesetzesnummer: ${args.law}`);
      return;
    }
    console.log(`  Filtering to single law: ${args.law} (${lawEntries[0].kurztitel})\n`);
  }

  // Skip laws with no provisions
  lawEntries = lawEntries.filter(e => e.provisions.length > 0);

  let totalLaws = 0;
  let totalProvisions = 0;
  let skippedLaws = 0;
  let failedXml = 0;

  for (const law of lawEntries) {
    const seedFile = path.join(SEED_DIR, `gesetz-${law.gesetzesnummer}.json`);

    // Skip if seed already exists
    if (fs.existsSync(seedFile)) {
      skippedLaws++;
      continue;
    }

    const shortName = extractShortName(law.kurztitel);
    const provisions: SeedProvision[] = [];

    for (const prov of law.provisions) {
      try {
        const xml = await fetchDocumentXml(prov.id);
        const parsed = parseRisdokXml(xml, prov.artikelParagraphAnlage);

        if (parsed) {
          provisions.push({
            provision_ref: parsed.provision_ref,
            section: parsed.section,
            title: parsed.title,
            content: parsed.content,
          });
        }
      } catch (error) {
        failedXml++;
        // Silently continue — some documents may not have XML
      }
    }

    if (provisions.length === 0) continue;

    // Determine status: if any provision has no ausserkrafttretensdatum, law is in force
    const hasActiveProv = law.provisions.some(p => !p.ausserkrafttretensdatum);
    const status = hasActiveProv ? 'in_force' : 'repealed';

    const seed: SeedDocument = {
      id: `gesetz-${law.gesetzesnummer}`,
      type: mapDocType(law.typ),
      title: law.kurztitel,
      short_name: shortName,
      status,
      url: `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${law.gesetzesnummer}`,
      provisions,
    };

    fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2), 'utf-8');
    totalLaws++;
    totalProvisions += provisions.length;

    if (totalLaws % 10 === 0 || totalLaws <= 5) {
      console.log(`  [${totalLaws}] ${law.kurztitel}: ${provisions.length} provisions`);
    }
  }

  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  Laws processed: ${totalLaws}`);
  console.log(`  Laws skipped (existing seed): ${skippedLaws}`);
  console.log(`  Total provisions: ${totalProvisions}`);
  console.log(`  Failed XML fetches: ${failedXml}`);
  console.log('  ─────────────────────────────────────────────\n');
}

/**
 * Extract a short name from the Kurztitel.
 * e.g. "Datenschutzgesetz – DSG" -> "DSG"
 * e.g. "Bundesverfassungsgesetz" -> "Bundesverfassungsgesetz"
 */
function extractShortName(kurztitel: string): string {
  // Check for dash-separated abbreviation
  const dashMatch = kurztitel.match(/[–—-]\s*([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9\s-]+)$/);
  if (dashMatch) {
    return dashMatch[1].trim();
  }

  // Check for parenthesized abbreviation
  const parenMatch = kurztitel.match(/\(([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß0-9\s-]*)\)/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }

  return kurztitel;
}

/**
 * Map RIS document types to seed types.
 */
function mapDocType(typ: string): string {
  switch (typ) {
    case 'BG':
    case 'BVG':
      return 'statute';
    case 'V':
      return 'regulation';
    case 'K':
      return 'agreement';
    default:
      return 'statute';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Austrian Law MCP — Ingestion Pipeline          ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  if (args.limit) console.log(`  --limit ${args.limit} (${args.limit * 100} provisions max)`);
  if (args.law) console.log(`  --law ${args.law}`);

  const lawMap = await phase1Discovery(args);
  await phase2Content(lawMap, args);

  console.log('Done.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
