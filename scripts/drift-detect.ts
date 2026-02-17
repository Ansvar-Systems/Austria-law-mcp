#!/usr/bin/env tsx
/**
 * Upstream drift detection for anchored Austrian law pages.
 *
 * Usage:
 *   npm run drift:detect
 *   npm run drift:detect -- --update
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HASHES_PATH = join(__dirname, '..', 'fixtures', 'golden-hashes.json');
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_DELAY_MS = 800;

interface GoldenHashEntry {
  id: string;
  description: string;
  upstream_url: string;
  selector_hint: string;
  expected_sha256: string;
  expected_snippet?: string;
}

interface GoldenHashesFixture {
  version: string;
  mcp_name: string;
  jurisdiction?: string;
  description?: string;
  provisions?: GoldenHashEntry[];
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase();
}

function sha256(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Austrian-Law-MCP-DriftDetect/1.0.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } catch {
    return execFileSync(
      'curl',
      ['-fsSL', '--connect-timeout', '15', '--max-time', '25', url],
      { encoding: 'utf-8' },
    );
  }
}

async function main(): Promise<void> {
  const updateMode = process.argv.includes('--update');
  const allowErrors = process.argv.includes('--allow-errors');
  const raw = readFileSync(HASHES_PATH, 'utf-8');
  const fixture = JSON.parse(raw) as GoldenHashesFixture;
  const entries = fixture.provisions ?? [];

  if (entries.length === 0) {
    console.log('No drift anchors configured in fixtures/golden-hashes.json');
    process.exit(0);
  }

  console.log(`Drift detection (${entries.length} anchors)`);
  if (updateMode) {
    console.log('Mode: update expected hashes');
  }
  console.log('');

  let driftCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let updatedHashes = 0;

  for (const entry of entries) {
    process.stdout.write(`Checking ${entry.id}... `);

    try {
      const html = await fetchHtml(entry.upstream_url);
      const normalized = normalizeText(html);
      const actualHash = sha256(html);

      if (entry.expected_snippet && !normalized.includes(normalizeText(entry.expected_snippet))) {
        console.log('warning: expected snippet not found');
      }

      if (entry.expected_sha256 === 'COMPUTE_ON_FIRST_RUN') {
        if (updateMode) {
          entry.expected_sha256 = actualHash;
          updatedHashes++;
          console.log(`initialized (${actualHash.slice(0, 12)}...)`);
        } else {
          skippedCount++;
          console.log('skipped (placeholder hash)');
        }
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      if (entry.expected_sha256 !== actualHash) {
        if (updateMode) {
          entry.expected_sha256 = actualHash;
          updatedHashes++;
          console.log(`updated (${actualHash.slice(0, 12)}...)`);
        } else {
          driftCount++;
          console.log(`DRIFT (expected ${entry.expected_sha256.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...)`);
        }
      } else {
        console.log('ok');
      }
    } catch (error) {
      errorCount++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`error: ${message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (updateMode && updatedHashes > 0) {
    writeFileSync(HASHES_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf-8');
    console.log('');
    console.log(`Updated ${updatedHashes} hash(es) in fixtures/golden-hashes.json`);
  }

  console.log('');
  console.log(`Summary: ${entries.length - driftCount - errorCount - skippedCount} ok, ${driftCount} drift, ${errorCount} errors, ${skippedCount} skipped`);

  if (errorCount > 0) {
    if (allowErrors) {
      process.exit(0);
    }
    process.exit(1);
  }
  if (driftCount > 0) {
    process.exit(2);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Drift detection failed:', message);
  process.exit(1);
});
