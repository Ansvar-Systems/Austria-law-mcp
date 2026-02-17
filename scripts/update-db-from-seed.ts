#!/usr/bin/env tsx
/**
 * Incrementally updates data/database.db from seed JSON files.
 *
 * Usage:
 *   npm run db:update-seed
 *   npm run db:update-seed -- --laws "gesetz-10001622 gesetz-10003940"
 *   npm run db:update-seed -- --db data/database.db --seed-dir data/seed
 */

import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CliArgs {
  dbPath: string;
  seedDir: string;
  laws: string[];
}

interface SeedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string | null;
  content: string;
  valid_from?: string;
  valid_to?: string;
}

interface SeedDocument {
  id: string;
  type: 'statute' | 'regulation' | 'agreement';
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
  provisions?: SeedProvision[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let dbPath = resolve(__dirname, '../data/database.db');
  let seedDir = resolve(__dirname, '../data/seed');
  let laws: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--db' && args[i + 1]) {
      dbPath = resolve(process.cwd(), args[++i]);
      continue;
    }
    if (arg === '--seed-dir' && args[i + 1]) {
      seedDir = resolve(process.cwd(), args[++i]);
      continue;
    }
    if (arg === '--laws' && args[i + 1]) {
      const raw = args[++i];
      laws = raw
        .split(/[,\s]+/)
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => (value.startsWith('gesetz-') ? value : `gesetz-${value}`));
      continue;
    }
  }

  return { dbPath, seedDir, laws };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function dedupeProvisions(provisions: SeedProvision[]): SeedProvision[] {
  const byRef = new Map<string, SeedProvision>();

  for (const provision of provisions) {
    const ref = provision.provision_ref.trim();
    const existing = byRef.get(ref);
    if (!existing) {
      byRef.set(ref, { ...provision, provision_ref: ref });
      continue;
    }

    const existingContent = normalizeWhitespace(existing.content);
    const incomingContent = normalizeWhitespace(provision.content);
    if (incomingContent.length > existingContent.length) {
      byRef.set(ref, { ...provision, provision_ref: ref });
    }
  }

  return [...byRef.values()];
}

function main(): void {
  const { dbPath, seedDir, laws } = parseArgs();

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }
  if (!existsSync(seedDir)) {
    throw new Error(`Seed directory not found: ${seedDir}`);
  }

  const targetFiles = laws.length > 0
    ? laws.map(lawId => resolve(seedDir, `${lawId}.json`))
    : readdirSync(seedDir)
      .filter(file => file.endsWith('.json') && !file.startsWith('.') && !file.startsWith('_'))
      .map(file => resolve(seedDir, file));

  const existingFiles = targetFiles.filter(file => existsSync(file));
  if (existingFiles.length === 0) {
    throw new Error(
      laws.length > 0
        ? `No seed files found for requested laws in ${seedDir}`
        : `No seed JSON files found in ${seedDir}`,
    );
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = DELETE');

  const upsertDocument = db.prepare(`
    INSERT INTO legal_documents (
      id, type, title, title_en, short_name, status,
      issued_date, in_force_date, url, description, last_updated
    ) VALUES (
      @id, @type, @title, @title_en, @short_name, @status,
      @issued_date, @in_force_date, @url, @description, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      title_en = excluded.title_en,
      short_name = excluded.short_name,
      status = excluded.status,
      issued_date = excluded.issued_date,
      in_force_date = excluded.in_force_date,
      url = excluded.url,
      description = excluded.description,
      last_updated = datetime('now')
  `);

  const deleteProvisions = db.prepare(`
    DELETE FROM legal_provisions
    WHERE document_id = ?
  `);

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (
      document_id, provision_ref, chapter, section, title, content,
      order_index, valid_from, valid_to
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertMetadata = db.prepare(`
    INSERT INTO db_metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const applySeed = db.transaction((seed: SeedDocument) => {
    upsertDocument.run({
      id: seed.id,
      type: seed.type,
      title: seed.title,
      title_en: seed.title_en ?? null,
      short_name: seed.short_name ?? null,
      status: seed.status,
      issued_date: seed.issued_date ?? null,
      in_force_date: seed.in_force_date ?? null,
      url: seed.url ?? null,
      description: seed.description ?? null,
    });

    deleteProvisions.run(seed.id);

    const provisions = dedupeProvisions(seed.provisions ?? []);
    for (let i = 0; i < provisions.length; i++) {
      const provision = provisions[i];
      insertProvision.run(
        seed.id,
        provision.provision_ref,
        provision.chapter ?? null,
        provision.section,
        provision.title ?? null,
        provision.content,
        i + 1,
        provision.valid_from ?? null,
        provision.valid_to ?? null,
      );
    }

    return provisions.length;
  });

  let updatedDocs = 0;
  let updatedProvisions = 0;

  for (const filePath of existingFiles) {
    const raw = readFileSync(filePath, 'utf-8');
    const seed = JSON.parse(raw) as SeedDocument;

    if (!seed.id || !seed.type || !seed.title) {
      throw new Error(`Invalid seed document in ${basename(filePath)}`);
    }

    const provisionCount = applySeed(seed);
    updatedDocs++;
    updatedProvisions += provisionCount;
    console.log(`Updated ${seed.id} (${provisionCount} provisions)`);
  }

  const docCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM legal_documents').get() as { count: number }).count,
  );
  const provisionCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM legal_provisions').get() as { count: number }).count,
  );

  const builtAt = new Date().toISOString();
  upsertMetadata.run('built_at', builtAt);
  upsertMetadata.run('builder', 'update-db-from-seed.ts');
  upsertMetadata.run('document_count', String(docCount));
  upsertMetadata.run('provision_count', String(provisionCount));

  db.exec('ANALYZE');
  db.close();

  console.log('');
  console.log(`Updated documents: ${updatedDocs}`);
  console.log(`Updated provisions: ${updatedProvisions}`);
  console.log(`Database totals: ${docCount} documents, ${provisionCount} provisions`);
  console.log(`Metadata built_at: ${builtAt}`);
}

main();
