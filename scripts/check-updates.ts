#!/usr/bin/env tsx
/**
 * Check for potentially updated Austrian statutes.
 *
 * Strategy:
 * 1. Read local DB build timestamp.
 * 2. Resolve a set of anchor statutes from golden tests.
 * 3. Fetch RIS "Geltende Fassung" pages and compare "Fassung vom" date.
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.AUSTRIAN_LAW_DB_PATH ?? resolve(__dirname, '../data/database.db');
const FIXTURES_PATH = resolve(__dirname, '../fixtures/golden-tests.json');
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_DELAY_MS = 500;

interface GoldenTestFixture {
  tests?: Array<{
    tool?: string;
    input?: {
      document_id?: string;
    };
  }>;
}

interface AnchorDocument {
  id: string;
  title: string;
  url: string | null;
}

interface AnchorCheckResult {
  id: string;
  title: string;
  localBuiltAt: string;
  remoteFassungDate: string | null;
  hasUpdate: boolean;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAustrianDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return null;
  }
  const [, dd, mm, yyyy] = match;
  const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractFassungDate(html: string): string | null {
  const match = html.match(/Fassung vom\s+(\d{2}\.\d{2}\.\d{4})/i);
  return match?.[1] ?? null;
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Austrian-Law-MCP/1.0.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } catch {
    // Some environments throttle/timeout Node fetch while curl still succeeds.
    return execFileSync(
      'curl',
      ['-fsSL', '--connect-timeout', '15', '--max-time', '25', url],
      { encoding: 'utf-8' },
    );
  }
}

function loadAnchorIds(db: Database.Database): string[] {
  if (existsSync(FIXTURES_PATH)) {
    try {
      const fixture = JSON.parse(
        readFileSync(FIXTURES_PATH, 'utf-8'),
      ) as GoldenTestFixture;

      const fixtureIds = new Set<string>();
      for (const test of fixture.tests ?? []) {
        if (
          (test.tool === 'get_provision' || test.tool === 'check_currency') &&
          test.input?.document_id?.startsWith('gesetz-')
        ) {
          fixtureIds.add(test.input.document_id);
        }
      }
      if (fixtureIds.size > 0) {
        return [...fixtureIds];
      }
    } catch {
      // Fallback below
    }
  }

  const fallback = db.prepare(`
    SELECT id
    FROM legal_documents
    WHERE id LIKE 'gesetz-%'
    ORDER BY id
    LIMIT 5
  `).all() as Array<{ id: string }>;

  return fallback.map(row => row.id);
}

async function runCheck(): Promise<void> {
  const allowErrors = process.argv.includes('--allow-errors');

  console.log('Austrian Law MCP — Update Check');
  console.log('');

  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    console.error('Run "npm run build:db" first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const metaRows = db.prepare(`
    SELECT key, value FROM db_metadata
    WHERE key IN ('built_at', 'document_count', 'provision_count')
  `).all() as Array<{ key: string; value: string }>;
  const metadata = new Map(metaRows.map(row => [row.key, row.value]));

  const builtAt = metadata.get('built_at');
  if (!builtAt) {
    console.error('No db_metadata.built_at found.');
    db.close();
    process.exit(1);
  }

  const localBuiltAt = parseIsoDate(builtAt);
  if (!localBuiltAt) {
    console.error(`Invalid db_metadata.built_at: ${builtAt}`);
    db.close();
    process.exit(1);
  }

  const anchorIds = loadAnchorIds(db);
  const placeholders = anchorIds.map(() => '?').join(',');

  const anchors = db.prepare(`
    SELECT id, title, url
    FROM legal_documents
    WHERE id IN (${placeholders})
    ORDER BY id
  `).all(...anchorIds) as AnchorDocument[];

  console.log(`Database: ${DB_PATH}`);
  console.log(`Built at: ${builtAt}`);
  console.log(`Documents: ${metadata.get('document_count') ?? 'unknown'}`);
  console.log(`Provisions: ${metadata.get('provision_count') ?? 'unknown'}`);
  console.log(`Anchor statutes: ${anchors.length}`);
  console.log('');

  const results: AnchorCheckResult[] = [];

  for (const anchor of anchors) {
    process.stdout.write(`Checking ${anchor.id} (${anchor.title.slice(0, 50)})... `);

    if (!anchor.url) {
      results.push({
        id: anchor.id,
        title: anchor.title,
        localBuiltAt: builtAt,
        remoteFassungDate: null,
        hasUpdate: false,
        error: 'No source URL in database',
      });
      console.log('error: no URL');
      continue;
    }

    try {
      const html = await fetchText(anchor.url);
      const remoteDateStr = extractFassungDate(html);
      const remoteDate = remoteDateStr ? parseAustrianDate(remoteDateStr) : null;

      if (!remoteDate || !remoteDateStr) {
        results.push({
          id: anchor.id,
          title: anchor.title,
          localBuiltAt: builtAt,
          remoteFassungDate: null,
          hasUpdate: false,
          error: 'Could not parse "Fassung vom" date',
        });
        console.log('error: date not found');
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      const hasUpdate = remoteDate.getTime() > localBuiltAt.getTime();
      results.push({
        id: anchor.id,
        title: anchor.title,
        localBuiltAt: builtAt,
        remoteFassungDate: remoteDateStr,
        hasUpdate,
      });

      if (hasUpdate) {
        console.log(`UPDATE AVAILABLE (remote: ${remoteDateStr})`);
      } else {
        console.log(`up to date (remote: ${remoteDateStr})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: anchor.id,
        title: anchor.title,
        localBuiltAt: builtAt,
        remoteFassungDate: null,
        hasUpdate: false,
        error: message,
      });
      console.log(`error: ${message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  db.close();

  const updates = results.filter(result => result.hasUpdate);
  const errors = results.filter(result => result.error);

  console.log('');
  console.log('Summary');
  console.log(`Checked: ${results.length}`);
  console.log(`Updates: ${updates.length}`);
  console.log(`Errors: ${errors.length}`);

  if (updates.length > 0) {
    console.log('');
    console.log('Statutes requiring refresh:');
    for (const result of updates) {
      console.log(`- ${result.id} (${result.remoteFassungDate})`);
    }
    console.log('');
    console.log('Suggested refresh sequence:');
    console.log('1. npm run ingest -- --law <Gesetzesnummer>');
    console.log('2. npm run build:db');
  }

  if (updates.length > 0) {
    process.exit(1);
  }

  if (errors.length > 0) {
    if (allowErrors) {
      console.log('');
      console.log('Errors detected but ignored due to --allow-errors.');
      process.exit(0);
    }
    process.exit(2);
  }
}

runCheck().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Update check failed:', message);
  process.exit(1);
});
