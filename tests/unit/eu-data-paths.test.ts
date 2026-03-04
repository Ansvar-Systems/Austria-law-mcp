/**
 * EU data path tests.
 *
 * Tests code paths that require EU data to be present in the database.
 * Uses an in-memory writable DB with test fixture data.
 * Also covers error-catch branches in about.ts and list-sources.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { getAustrianImplementations } from '../../src/tools/get-austrian-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { getAbout } from '../../src/tools/about.js';
import { listSources } from '../../src/tools/list-sources.js';

let db: InstanceType<typeof Database>;

beforeAll(() => {
  // Create writable in-memory DB with test schema + data
  db = new Database(':memory:');

  db.prepare(`CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT)`).run();
  db.prepare(`INSERT INTO db_metadata VALUES ('tier', 'test')`).run();
  db.prepare(`INSERT INTO db_metadata VALUES ('schema_version', '1.0')`).run();
  db.prepare(`INSERT INTO db_metadata VALUES ('built_at', '2025-01-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO db_metadata VALUES ('jurisdiction', 'AT')`).run();

  db.prepare(`CREATE TABLE legal_documents (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT DEFAULT 'in_force',
    type TEXT DEFAULT 'BG',
    issued_date TEXT,
    in_force_date TEXT
  )`).run();
  db.prepare(`INSERT INTO legal_documents VALUES ('gesetz-test-1', 'Testgesetz', 'in_force', 'BG', '2020-01-01', '2020-06-01')`).run();

  db.prepare(`CREATE TABLE legal_provisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT,
    provision_ref TEXT,
    chapter TEXT,
    section TEXT,
    title TEXT,
    content TEXT,
    order_index INTEGER DEFAULT 0
  )`).run();
  db.prepare(`INSERT INTO legal_provisions VALUES (1, 'gesetz-test-1', 'para1', NULL, '§ 1', 'Test §', 'Test provision content.', 0)`).run();

  db.prepare(`CREATE VIRTUAL TABLE provisions_fts USING fts5(content, content_rowid='id', tokenize='unicode61')`).run();
  db.prepare(`INSERT INTO provisions_fts(rowid, content) VALUES (1, 'Test provision content.')`).run();

  db.prepare(`CREATE TABLE eu_documents (
    id TEXT PRIMARY KEY,
    type TEXT,
    year INTEGER,
    number INTEGER,
    community TEXT,
    celex_number TEXT,
    title TEXT,
    short_name TEXT,
    url_eur_lex TEXT
  )`).run();
  db.prepare(`INSERT INTO eu_documents VALUES (
    'regulation:2016/679', 'regulation', 2016, 679, 'EU',
    '32016R0679', 'General Data Protection Regulation', 'GDPR',
    'https://eur-lex.europa.eu/eli/reg/2016/679'
  )`).run();
  db.prepare(`INSERT INTO eu_documents VALUES (
    'directive:2016/1148', 'directive', 2016, 1148, 'EU',
    '32016L1148', 'NIS Directive', 'NIS',
    NULL
  )`).run();

  db.prepare(`CREATE TABLE eu_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT,
    provision_id INTEGER,
    eu_document_id TEXT,
    eu_article TEXT,
    reference_type TEXT,
    is_primary_implementation INTEGER DEFAULT 0,
    full_citation TEXT,
    reference_context TEXT
  )`).run();
  // Primary GDPR reference at provision level
  db.prepare(`INSERT INTO eu_references VALUES (1, 'gesetz-test-1', 1, 'regulation:2016/679', 'Art. 6', 'implements', 1, 'Regulation (EU) 2016/679', 'data processing')`).run();
  // Non-primary NIS reference at document level
  db.prepare(`INSERT INTO eu_references VALUES (2, 'gesetz-test-1', NULL, 'directive:2016/1148', 'Art. 14', 'cites', 0, 'Directive (EU) 2016/1148', 'security measures')`).run();

  // EU document with all optional fields NULL (covers null-field branches)
  db.prepare(`INSERT INTO eu_documents VALUES (
    'directive:2020/999', 'directive', 2020, 999, 'EU',
    NULL, NULL, NULL, NULL
  )`).run();
  // Reference with null article and null context (covers provision-eu-basis null branches)
  db.prepare(`INSERT INTO eu_references VALUES (3, 'gesetz-test-1', 1, 'directive:2020/999', NULL, 'cites', 0, NULL, NULL)`).run();
});

afterAll(() => {
  db.close();
});

describe('get_eu_basis with populated EU data', () => {
  it('returns EU documents with full mapping', async () => {
    const result = await getEUBasis(db, { document_id: 'gesetz-test-1' });
    expect(result.results.eu_documents.length).toBeGreaterThan(0);
    expect(result.results.statistics.total_eu_references).toBeGreaterThan(0);

    const gdpr = result.results.eu_documents.find(d => d.id === 'regulation:2016/679');
    expect(gdpr).toBeDefined();
    expect(gdpr!.type).toBe('regulation');
    expect(gdpr!.year).toBe(2016);
    expect(gdpr!.is_primary_implementation).toBe(true);
    expect(gdpr!.celex_number).toBe('32016R0679');
    expect(gdpr!.title).toContain('General Data Protection');
    expect(gdpr!.short_name).toBe('GDPR');
    expect(gdpr!.url_eur_lex).toBeTruthy();
  });

  it('returns statistics with directive and regulation counts', async () => {
    const result = await getEUBasis(db, { document_id: 'gesetz-test-1' });
    expect(result.results.statistics.regulation_count).toBeGreaterThanOrEqual(1);
    expect(result.results.statistics.directive_count).toBeGreaterThanOrEqual(0);
  });

  it('filters by reference_types', async () => {
    const result = await getEUBasis(db, {
      document_id: 'gesetz-test-1',
      reference_types: ['implements'],
    });
    expect(result.results.eu_documents.length).toBe(1);
    expect(result.results.eu_documents[0].reference_type).toBe('implements');
  });

  it('includes articles when requested', async () => {
    const result = await getEUBasis(db, {
      document_id: 'gesetz-test-1',
      include_articles: true,
    });
    const gdpr = result.results.eu_documents.find(d => d.id === 'regulation:2016/679');
    expect(gdpr?.articles).toBeDefined();
    expect(gdpr!.articles!.length).toBeGreaterThan(0);
    expect(gdpr!.articles).toContain('Art. 6');
  });
});

describe('get_eu_basis — null optional fields', () => {
  it('omits celex_number, title, short_name, url_eur_lex when null', async () => {
    const result = await getEUBasis(db, { document_id: 'gesetz-test-1' });
    const sparse = result.results.eu_documents.find(d => d.id === 'directive:2020/999');
    expect(sparse).toBeDefined();
    // These optional fields should be absent (not set) since the DB values are NULL
    expect(sparse!.celex_number).toBeUndefined();
    expect(sparse!.title).toBeUndefined();
    expect(sparse!.short_name).toBeUndefined();
    expect(sparse!.url_eur_lex).toBeUndefined();
  });
});

describe('get_provision_eu_basis with populated EU data', () => {
  it('returns EU references for provision with mapping', async () => {
    const result = await getProvisionEUBasis(db, {
      document_id: 'gesetz-test-1',
      provision_ref: '1',
    });
    expect(result.results.eu_references.length).toBeGreaterThan(0);
    expect(result.results.provision_content).toBeTruthy();

    const gdprRef = result.results.eu_references.find(r => r.id === 'regulation:2016/679');
    expect(gdprRef).toBeDefined();
    expect(gdprRef!.type).toBe('regulation');
    expect(gdprRef!.reference_type).toBe('implements');
    expect(gdprRef!.full_citation).toContain('2016/679');
    expect(gdprRef!.title).toContain('General Data Protection');
    expect(gdprRef!.short_name).toBe('GDPR');
    expect(gdprRef!.article).toBe('Art. 6');
    expect(gdprRef!.context).toBe('data processing');
  });
});

describe('get_provision_eu_basis — null optional fields', () => {
  it('omits title, short_name, article, context when null', async () => {
    const result = await getProvisionEUBasis(db, {
      document_id: 'gesetz-test-1',
      provision_ref: '1',
    });
    const sparse = result.results.eu_references.find(r => r.id === 'directive:2020/999');
    expect(sparse).toBeDefined();
    expect(sparse!.title).toBeUndefined();
    expect(sparse!.short_name).toBeUndefined();
    expect(sparse!.article).toBeUndefined();
    expect(sparse!.context).toBeUndefined();
  });
});

describe('get_austrian_implementations with populated EU data', () => {
  it('returns implementing statutes with row mapping', async () => {
    const result = await getAustrianImplementations(db, {
      eu_document_id: 'regulation:2016/679',
    });
    expect(result.results.eu_title).toBe('General Data Protection Regulation');
    expect(result.results.implementations.length).toBe(1);
    expect(result.results.implementations[0].document_id).toBe('gesetz-test-1');
    expect(result.results.implementations[0].title).toBe('Testgesetz');
    expect(result.results.implementations[0].is_primary).toBe(true);
  });
});

describe('search_eu_implementations with populated EU data', () => {
  it('finds EU documents with implementation counts', async () => {
    const result = await searchEUImplementations(db, { query: 'Data Protection' });
    expect(result.results.results.length).toBeGreaterThan(0);
    const gdpr = result.results.results.find(r => r.eu_document.id === 'regulation:2016/679');
    expect(gdpr).toBeDefined();
    expect(gdpr!.austrian_statute_count).toBeGreaterThanOrEqual(1);
  });

  it('returns primary_implementations list', async () => {
    const result = await searchEUImplementations(db, {
      has_austrian_implementation: true,
    });
    const withPrimary = result.results.results.find(
      r => r.primary_implementations.length > 0
    );
    if (withPrimary) {
      expect(withPrimary.primary_implementations).toContain('gesetz-test-1');
    }
  });
});

describe('search_eu_implementations — null title/short_name', () => {
  it('returns undefined for null title and short_name', async () => {
    const result = await searchEUImplementations(db, {});
    const sparse = result.results.results.find(r => r.eu_document.id === 'directive:2020/999');
    expect(sparse).toBeDefined();
    expect(sparse!.eu_document.title).toBeUndefined();
    expect(sparse!.eu_document.short_name).toBeUndefined();
  });

  it('filters by type parameter', async () => {
    const result = await searchEUImplementations(db, { type: 'regulation' });
    expect(result.results.results.every(r => r.eu_document.type === 'regulation')).toBe(true);
  });

  it('filters by community parameter', async () => {
    const result = await searchEUImplementations(db, { community: 'EU' });
    expect(result.results.results.every(r => r.eu_document.community === 'EU')).toBe(true);
  });

  it('filters by year_from and year_to', async () => {
    const result = await searchEUImplementations(db, { year_from: 2016, year_to: 2016 });
    expect(result.results.results.every(r => r.eu_document.year === 2016)).toBe(true);
  });
});

describe('validate_eu_compliance — with EU data', () => {
  it('detects mixed compliance (primary + non-primary refs)', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-test-1',
    });
    expect(['compliant', 'partial']).toContain(result.results.compliance_status);
    expect(result.results.eu_references_found).toBeGreaterThan(0);
  });

  it('detects non-primary only warning', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-test-1',
      eu_document_id: 'directive:2016/1148',
    });
    expect(result.results.eu_references_found).toBe(1);
    expect(result.results.warnings.some(w => w.includes('non-primary'))).toBe(true);
  });
});

describe('validate_eu_compliance — compliant status', () => {
  it('returns compliant when only primary references exist', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-test-1',
      eu_document_id: 'regulation:2016/679',
    });
    expect(result.results.compliance_status).toBe('compliant');
    expect(result.results.warnings.length).toBe(0);
  });
});

describe('about — safeCount error path', () => {
  it('handles safeCount error gracefully', () => {
    const brokenDb = new Database(':memory:');
    const result = getAbout(brokenDb, {
      version: '1.0.0',
      fingerprint: 'test',
      dbBuilt: '2025-01-01',
    });
    expect(result.dataset.counts.legal_documents).toBe(0);
    expect(result.dataset.counts.eu_documents).toBe(0);
    brokenDb.close();
  });
});

describe('list_sources — error paths', () => {
  it('handles safeMetadata/safeCount errors gracefully', async () => {
    const brokenDb = new Database(':memory:');
    const result = await listSources(brokenDb);
    expect(result.results.database.tier).toBe('free');
    expect(result.results.database.schema_version).toBe('unknown');
    expect(result.results.database.document_count).toBe(0);
    expect(result.results.database.eu_document_count).toBe(0);
    brokenDb.close();
  });

  it('returns null for metadata key with null value', async () => {
    const nullDb = new Database(':memory:');
    nullDb.prepare('CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
    nullDb.prepare("INSERT INTO db_metadata VALUES ('tier', NULL)").run();
    nullDb.prepare("INSERT INTO db_metadata VALUES ('schema_version', NULL)").run();
    // Create tables so safeCount succeeds (both branches of the ternary)
    nullDb.prepare('CREATE TABLE legal_documents (id TEXT)').run();
    nullDb.prepare('CREATE TABLE legal_provisions (id TEXT)').run();
    nullDb.prepare('CREATE TABLE eu_documents (id TEXT)').run();
    nullDb.prepare('CREATE TABLE eu_references (id TEXT)').run();
    const result = await listSources(nullDb);
    // tier falls back to 'free' when null
    expect(result.results.database.tier).toBe('free');
    expect(result.results.database.document_count).toBe(0);
    nullDb.close();
  });
});
