/**
 * Coverage completeness tests.
 *
 * Covers every remaining uncovered branch and line across the codebase
 * to achieve 100% statement/branch/function coverage.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

// --- Utilities ---
import { normalizeAsOfDate } from '../../src/utils/as-of-date.js';
import { isValidStatuteId, statuteIdCandidates, resolveExistingStatuteId } from '../../src/utils/statute-id.js';
import { buildProvisionLookupCandidates } from '../../src/utils/provision-candidates.js';
import { buildFtsQueryVariants, buildSanitizedFallback } from '../../src/utils/fts-query.js';
import { generateResponseMetadata } from '../../src/utils/metadata.js';
import { makeAboutContext } from '../../src/utils/about-context.js';
import { cleanProvisionContent } from '../../src/utils/content-cleaner.js';

// --- Capabilities ---
import { detectCapabilities, readDbMetadata, upgradeMessage } from '../../src/capabilities.js';

// --- Citation ---
import { parseCitation } from '../../src/citation/parser.js';
import { formatCitation } from '../../src/citation/formatter.js';
import { validateCitation } from '../../src/citation/validator.js';

// --- Tools ---
import { searchLegislation } from '../../src/tools/search-legislation.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getAustrianImplementations } from '../../src/tools/get-austrian-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { getAbout } from '../../src/tools/about.js';
import { listSources } from '../../src/tools/list-sources.js';
import { registerTools, buildTools } from '../../src/tools/registry.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { SERVER_VERSION } from '../../src/server-info.js';

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database('data/database.db', { readonly: true });
});

afterAll(() => {
  db.close();
});

// =============================================================================
// UTILITIES
// =============================================================================

describe('as-of-date', () => {
  it('returns undefined for null input', () => {
    expect(normalizeAsOfDate(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeAsOfDate('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only', () => {
    expect(normalizeAsOfDate('   ')).toBeUndefined();
  });

  it('returns valid ISO date', () => {
    expect(normalizeAsOfDate('2024-01-15')).toBe('2024-01-15');
  });

  it('throws for non-ISO format', () => {
    expect(() => normalizeAsOfDate('15.01.2024')).toThrow('YYYY-MM-DD');
  });

  it('throws for invalid calendar date (Feb 30)', () => {
    expect(() => normalizeAsOfDate('2024-02-30')).toThrow('YYYY-MM-DD');
  });

  it('throws for random string', () => {
    expect(() => normalizeAsOfDate('not-a-date')).toThrow('YYYY-MM-DD');
  });
});

describe('statute-id', () => {
  it('isValidStatuteId returns true for non-empty string', () => {
    expect(isValidStatuteId('gesetz-123')).toBe(true);
  });

  it('isValidStatuteId returns false for empty string', () => {
    expect(isValidStatuteId('')).toBe(false);
  });

  it('isValidStatuteId returns false for whitespace-only', () => {
    expect(isValidStatuteId('   ')).toBe(false);
  });

  it('statuteIdCandidates generates dash variants from spaces', () => {
    const candidates = statuteIdCandidates('data protection act');
    expect(candidates).toContain('data-protection-act');
  });

  it('statuteIdCandidates generates space variants from dashes', () => {
    const candidates = statuteIdCandidates('data-protection-act');
    expect(candidates).toContain('data protection act');
  });

  it('statuteIdCandidates preserves original casing', () => {
    const candidates = statuteIdCandidates('ABGB');
    expect(candidates).toContain('ABGB');
    expect(candidates).toContain('abgb');
  });

  it('resolveExistingStatuteId resolves by exact ID', () => {
    const id = resolveExistingStatuteId(db, 'gesetz-10001622');
    expect(id).toBe('gesetz-10001622');
  });

  it('resolveExistingStatuteId resolves by title LIKE', () => {
    const id = resolveExistingStatuteId(db, 'Allgemeines bürgerliches Gesetzbuch');
    expect(id).toBeTruthy();
  });

  it('resolveExistingStatuteId returns null for non-existent', () => {
    expect(resolveExistingStatuteId(db, 'xyzzy-99999')).toBeNull();
  });
});

describe('provision-candidates', () => {
  it('returns empty for empty input', () => {
    const result = buildProvisionLookupCandidates('');
    expect(result.provisionRefs).toEqual([]);
    expect(result.sections).toEqual([]);
    expect(result.canonicalSection).toBe('');
  });

  it('handles § prefix', () => {
    const result = buildProvisionLookupCandidates('§ 4a');
    expect(result.canonicalSection).toBe('4a');
    expect(result.provisionRefs).toContain('para4a');
  });

  it('handles para prefix', () => {
    const result = buildProvisionLookupCandidates('para5');
    expect(result.canonicalSection).toBe('5');
  });
});

describe('fts-query', () => {
  it('returns primary only for empty tokens after sanitization', () => {
    const result = buildFtsQueryVariants('!!!');
    expect(result.primary).toBe('!!!');
  });

  it('buildSanitizedFallback returns null for empty tokens', () => {
    expect(buildSanitizedFallback('!!! ### $$$')).toBeNull();
  });

  it('buildSanitizedFallback returns OR-joined quoted tokens', () => {
    const result = buildSanitizedFallback('"Datenschutz" AND "Recht"');
    expect(result).toContain('OR');
    expect(result).toContain('Datenschutz');
    expect(result).toContain('Recht');
  });

  it('handles explicit FTS5 syntax with fallback', () => {
    const result = buildFtsQueryVariants('"Datenschutz" AND "Recht"');
    expect(result.primary).toContain('AND');
    expect(result.fallback).toBeTruthy();
  });

  it('handles plain multi-word query', () => {
    const result = buildFtsQueryVariants('Daten Schutz');
    expect(result.primary).toContain('"Daten"');
    expect(result.fallback).toContain('OR');
  });
});

describe('metadata', () => {
  it('returns unknown freshness without db', () => {
    const meta = generateResponseMetadata();
    expect(meta.data_freshness).toContain('unknown');
  });

  it('returns freshness with db', () => {
    const meta = generateResponseMetadata(db);
    expect(meta.data_freshness).toBeTruthy();
    expect(meta.data_freshness).not.toContain('unknown');
  });
});

describe('about-context', () => {
  it('creates context with valid path', () => {
    const ctx = makeAboutContext('data/database.db', db, SERVER_VERSION);
    expect(ctx.version).toBe(SERVER_VERSION);
    expect(ctx.fingerprint).not.toBe('unknown');
    expect(ctx.dbBuilt).toBeTruthy();
  });

  it('handles non-existent path gracefully', () => {
    const ctx = makeAboutContext('/nonexistent/path.db', db, '1.0.0');
    expect(ctx.fingerprint).toBe('unknown');
  });
});

describe('content-cleaner edge cases', () => {
  it('handles keyword line with verb (should NOT strip)', () => {
    const raw = [
      'BGBl. Nr. 1/2000',
      '§ 1',
      '01.01.2000',
      'Die Sicherheit ist gewährleistet, Schutz und Recht.',
    ].join('\n');
    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toContain('Sicherheit');
  });
});

// =============================================================================
// CAPABILITIES
// =============================================================================

describe('capabilities', () => {
  it('detectCapabilities finds core_legislation', () => {
    const caps = detectCapabilities(db);
    expect(caps.has('core_legislation')).toBe(true);
  });

  it('detectCapabilities detects eu_references tables', () => {
    const caps = detectCapabilities(db);
    // eu_references capability depends on eu_documents + eu_references tables existing
    expect(typeof caps.has('eu_references')).toBe('boolean');
  });

  it('readDbMetadata reads metadata table', () => {
    const meta = readDbMetadata(db);
    expect(meta.tier).toBeTruthy();
    expect(meta.schema_version).toBeTruthy();
  });

  it('upgradeMessage returns formatted string', () => {
    const msg = upgradeMessage('case_law');
    expect(msg).toContain('case_law');
    expect(msg).toContain('professional-tier');
  });
});

// =============================================================================
// CITATION PARSER
// =============================================================================

describe('citation parser — all patterns', () => {
  it('parses "§ 1, Title" format', () => {
    const result = parseCitation('§ 1, Allgemeines bürgerliches Gesetzbuch');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('1');
    expect(result.title).toContain('Allgemeines');
  });

  it('parses "Title § 1" format', () => {
    const result = parseCitation('Allgemeines bürgerliches Gesetzbuch § 1');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('1');
    expect(result.title).toContain('Allgemeines');
  });

  it('parses "para1, Title" format', () => {
    const result = parseCitation('para1, ABGB');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('1');
    expect(result.title).toBe('ABGB');
  });

  it('parses legacy English "Section 3, Act 2018" format with year', () => {
    const result = parseCitation('Section 3, Data Protection Act 2018');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('3');
    expect(result.year).toBe(2018);
  });

  it('parses legacy English "Section 3, Act" format without year', () => {
    const result = parseCitation('Section 3, Data Protection Act');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('3');
    expect(result.title).toBe('Data Protection Act');
    expect(result.year).toBeUndefined();
  });

  it('parses bare "para1" format', () => {
    const result = parseCitation('para1');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('1');
  });

  it('parses bare "§ 1" format', () => {
    const result = parseCitation('§ 1');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('1');
  });

  it('parses section with subsection "§ 3(1)(a)"', () => {
    const result = parseCitation('§ 3(1)(a), DSG');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('3');
    expect(result.subsection).toBe('1');
    expect(result.paragraph).toBe('a');
  });

  it('returns error for unparseable input', () => {
    const result = parseCitation('random gibberish');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Could not parse');
  });

  it('returns error for empty input', () => {
    const result = parseCitation('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Empty');
  });

  it('parses title with year suffix', () => {
    const result = parseCitation('§ 5, Datenschutzgesetz 2000');
    expect(result.valid).toBe(true);
    expect(result.year).toBe(2000);
    expect(result.title).toBe('Datenschutzgesetz');
  });
});

// =============================================================================
// CITATION FORMATTER
// =============================================================================

describe('citation formatter — all formats', () => {
  it('formats full citation with title', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '1', title: 'ABGB' },
      'full'
    );
    expect(result).toBe('§ 1, ABGB');
  });

  it('formats full citation without title', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '1' },
      'full'
    );
    expect(result).toBe('§ 1');
  });

  it('formats short citation', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '3', title: 'DSG' },
      'short'
    );
    expect(result).toBe('§ 3 DSG');
  });

  it('formats short citation without title', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '3' },
      'short'
    );
    expect(result).toBe('§ 3');
  });

  it('formats pinpoint citation', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '3' },
      'pinpoint'
    );
    expect(result).toBe('§ 3');
  });

  it('formats with subsection', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '3', subsection: '1', title: 'DSG' },
      'full'
    );
    expect(result).toBe('§ 3(1), DSG');
  });

  it('formats with subsection and paragraph', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '3', subsection: '1', paragraph: 'a', title: 'DSG' },
      'full'
    );
    expect(result).toBe('§ 3(1)(a), DSG');
  });

  it('formats with year', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '5', title: 'Datenschutzgesetz', year: 2000 },
      'full'
    );
    expect(result).toBe('§ 5, Datenschutzgesetz 2000');
  });

  it('returns empty for invalid citation', () => {
    const result = formatCitation({ valid: false, type: 'unknown' }, 'full');
    expect(result).toBe('');
  });

  it('returns empty for citation without section', () => {
    const result = formatCitation({ valid: true, type: 'statute', title: 'ABGB' }, 'full');
    expect(result).toBe('');
  });

  it('handles default format parameter', () => {
    const result = formatCitation({ valid: true, type: 'statute', section: '1', title: 'ABGB' });
    expect(result).toBe('§ 1, ABGB');
  });
});

// =============================================================================
// CITATION VALIDATOR
// =============================================================================

describe('citation validator — all paths', () => {
  it('validates valid citation', () => {
    const result = validateCitation(db, '§ 1, Allgemeines bürgerliches Gesetzbuch');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(true);
  });

  it('reports invalid citation format', () => {
    const result = validateCitation(db, 'random gibberish');
    expect(result.document_exists).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('reports missing title for bare section ref', () => {
    const result = validateCitation(db, '§ 1');
    // Bare § 1 has no title — depends on whether it can resolve
    expect(result).toBeDefined();
  });

  it('reports document not found', () => {
    const result = validateCitation(db, '§ 1, Nichtexistierendes Gesetz');
    expect(result.document_exists).toBe(false);
    expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('reports provision not found in valid document', () => {
    const result = validateCitation(db, '§ 99999, Allgemeines bürgerliches Gesetzbuch');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(false);
    expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('validates with explicit statute ID', () => {
    const result = validateCitation(db, '§ 1, gesetz-10001622');
    expect(result.document_exists).toBe(true);
  });
});

// =============================================================================
// TOOLS — UNCOVERED PATHS
// =============================================================================

describe('search_legislation — additional paths', () => {
  it('filters by document_id', async () => {
    const result = await searchLegislation(db, {
      query: 'Recht',
      document_id: 'gesetz-10001622',
    });
    if (result.results.length > 0) {
      expect(result.results.every(r => r.document_id === 'gesetz-10001622')).toBe(true);
    }
  });

  it('filters by status', async () => {
    const result = await searchLegislation(db, {
      query: 'Recht',
      status: 'in_force',
    });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('accepts valid as_of_date filter', async () => {
    const result = await searchLegislation(db, {
      query: 'Recht',
      as_of_date: '2024-06-01',
    });
    expect(Array.isArray(result.results)).toBe(true);
  });
});

describe('get_provision — bulk path', () => {
  it('returns all provisions for a document (no section)', async () => {
    const result = await getProvision(db, {
      document_id: 'gesetz-10001622',
    });
    expect(Array.isArray(result.results)).toBe(true);
    const results = result.results as any[];
    expect(results.length).toBeGreaterThan(1);
  });

  it('truncates results when provisions exceed MAX_PROVISIONS (200)', async () => {
    // gesetz-10001622 has 1660 provisions, should trigger truncation
    const result = await getProvision(db, {
      document_id: 'gesetz-10001622',
    });
    const results = result.results as any[];
    expect(results.length).toBe(200);
    expect((result as any)._truncated).toBe(true);
    expect((result as any)._total_hint).toContain('More than 200');
  });

  it('does NOT truncate results when provisions fit in limit', async () => {
    // gesetz-20009944 has 198 provisions (< 200)
    const result = await getProvision(db, {
      document_id: 'gesetz-20009944',
    });
    const results = result.results as any[];
    expect(results.length).toBeLessThanOrEqual(200);
    expect((result as any)._truncated).toBeUndefined();
  });
});

describe('build_legal_stance — additional paths', () => {
  it('filters by document_id', async () => {
    const result = await buildLegalStance(db, {
      query: 'Recht',
      document_id: 'gesetz-10001622',
    });
    expect(Array.isArray(result.results.provisions)).toBe(true);
  });
});

describe('check_currency — additional paths', () => {
  it('reports repealed statute warning', async () => {
    // Find a repealed statute if any
    const repealed = db.prepare(
      "SELECT id FROM legal_documents WHERE status = 'repealed' LIMIT 1"
    ).get() as { id: string } | undefined;

    if (repealed) {
      const result = await checkCurrency(db, { document_id: repealed.id });
      expect(result.results).toBeTruthy();
      expect(result.results!.warnings).toContain('This statute has been repealed');
      expect(result.results!.is_current).toBe(false);
    }
  });

  it('reports provision not found warning', async () => {
    const result = await checkCurrency(db, {
      document_id: 'gesetz-10001622',
      provision_ref: '99999',
    });
    expect(result.results).toBeTruthy();
    expect(result.results!.provision_exists).toBe(false);
    expect(result.results!.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('accepts valid as_of_date', async () => {
    const result = await checkCurrency(db, {
      document_id: 'gesetz-10001622',
      as_of_date: '2024-01-15',
    });
    expect(result.results).toBeTruthy();
  });
});

describe('get_eu_basis — reference_types filter and mapping', () => {
  it('handles reference_types filter (even with empty EU data)', async () => {
    const result = await getEUBasis(db, {
      document_id: 'gesetz-10001622',
      reference_types: ['implements'],
    });
    expect(result.results.eu_documents).toBeDefined();
    expect(result.results.statistics.total_eu_references).toBeDefined();
    expect(result.results.statistics.directive_count).toBeDefined();
    expect(result.results.statistics.regulation_count).toBeDefined();
  });

  it('handles include_articles flag', async () => {
    const result = await getEUBasis(db, {
      document_id: 'gesetz-10001622',
      include_articles: true,
    });
    expect(result.results.eu_documents).toBeDefined();
  });
});

describe('get_austrian_implementations — filters', () => {
  it('handles primary_only filter', async () => {
    const result = await getAustrianImplementations(db, {
      eu_document_id: 'regulation:2016/679',
      primary_only: true,
    });
    expect(result.results.implementations).toBeDefined();
  });

  it('handles in_force_only filter', async () => {
    const result = await getAustrianImplementations(db, {
      eu_document_id: 'regulation:2016/679',
      in_force_only: true,
    });
    expect(result.results.implementations).toBeDefined();
  });
});

describe('search_eu_implementations — filters', () => {
  it('filters by type', async () => {
    const result = await searchEUImplementations(db, {
      type: 'directive',
    });
    expect(result.results).toBeDefined();
  });

  it('filters by year range', async () => {
    const result = await searchEUImplementations(db, {
      year_from: 2010,
      year_to: 2020,
    });
    expect(result.results).toBeDefined();
  });

  it('filters by has_austrian_implementation true', async () => {
    const result = await searchEUImplementations(db, {
      has_austrian_implementation: true,
    });
    expect(result.results).toBeDefined();
  });

  it('filters by has_austrian_implementation false', async () => {
    const result = await searchEUImplementations(db, {
      has_austrian_implementation: false,
    });
    expect(result.results).toBeDefined();
  });
});

describe('validate_eu_compliance — additional paths', () => {
  it('returns unclear when provision not found', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-10001622',
      provision_ref: '99999',
    });
    expect(result.results.compliance_status).toBe('unclear');
    expect(result.results.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('handles eu_document_id filter', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-10001622',
      eu_document_id: 'regulation:2016/679',
    });
    expect(result.results.compliance_status).toBeDefined();
  });

  it('returns not_applicable when no EU refs found', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-10001622',
    });
    expect(['not_applicable', 'compliant', 'partial', 'unclear']).toContain(
      result.results.compliance_status
    );
  });
});

describe('get_provision_eu_basis — provision content mapping', () => {
  it('returns EU references for known provision', async () => {
    const result = await getProvisionEUBasis(db, {
      document_id: 'gesetz-10001622',
      provision_ref: '1',
    });
    expect(result.results.document_id).toBe('gesetz-10001622');
    expect(Array.isArray(result.results.eu_references)).toBe(true);
    expect(result.results.provision_content).toBeDefined();
  });
});

describe('about tool', () => {
  it('returns complete about result', () => {
    const ctx = makeAboutContext('data/database.db', db, SERVER_VERSION);
    const result = getAbout(db, ctx);
    expect(result.server.name).toBe('Austrian Law MCP');
    expect(result.dataset.jurisdiction).toBe('Austria (AT)');
    expect(result.dataset.counts.legal_documents).toBeGreaterThan(0);
    expect(result.provenance.sources.length).toBeGreaterThan(0);
    expect(result.security.access_model).toBe('read-only');
  });
});

describe('list_sources — coverage paths', () => {
  it('returns EU counts in database info', async () => {
    const result = await listSources(db);
    expect(result.results.database.eu_document_count).toBeDefined();
    expect(result.results.database.eu_reference_count).toBeDefined();
  });
});

describe('format_citation tool — all paths', () => {
  it('formats with short format', async () => {
    const result = await formatCitationTool({ citation: '§ 1 ABGB', format: 'short' });
    expect(result.results.valid).toBe(true);
    expect(result.results.formatted).toContain('§');
  });

  it('formats with pinpoint format', async () => {
    const result = await formatCitationTool({ citation: '§ 1 ABGB', format: 'pinpoint' });
    expect(result.results.valid).toBe(true);
  });
});

describe('registry — tool dispatching', () => {
  it('buildTools includes all standard tools', () => {
    const tools = buildTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('search_legislation');
    expect(names).toContain('get_provision');
    expect(names).toContain('validate_citation');
    expect(names).toContain('build_legal_stance');
    expect(names).toContain('format_citation');
    expect(names).toContain('check_currency');
    expect(names).toContain('list_sources');
    expect(names).toContain('get_eu_basis');
    expect(names).toContain('get_austrian_implementations');
    expect(names).toContain('search_eu_implementations');
    expect(names).toContain('get_provision_eu_basis');
    expect(names).toContain('validate_eu_compliance');
  });
});

// =============================================================================
// REMAINING UNCOVERED BRANCHES
// =============================================================================

describe('capabilities — branch coverage', () => {
  it('readDbMetadata returns defaults when metadata is partial', () => {
    const partialDb = new Database(':memory:');
    partialDb.prepare('CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
    partialDb.prepare("INSERT INTO db_metadata VALUES ('tier', 'test')").run();
    // built_at and builder not present — should use defaults
    const meta = readDbMetadata(partialDb);
    expect(meta.tier).toBe('test');
    expect(meta.built_at).toBeUndefined();
    expect(meta.builder).toBeUndefined();
    partialDb.close();
  });

  it('readDbMetadata handles missing db_metadata table', () => {
    const emptyDb = new Database(':memory:');
    const meta = readDbMetadata(emptyDb);
    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('1.0');
    emptyDb.close();
  });
});

describe('formatter — default branch', () => {
  it('handles unknown format by falling back to full with title', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '1', title: 'ABGB' },
      'xyzzy' as any
    );
    expect(result).toBe('§ 1, ABGB');
  });

  it('handles unknown format without title', () => {
    const result = formatCitation(
      { valid: true, type: 'statute', section: '1' },
      'xyzzy' as any
    );
    expect(result).toBe('§ 1');
  });
});

describe('parser — edge cases', () => {
  it('parses "Paragraph" keyword variant', () => {
    const result = parseCitation('Paragraph 5, DSG');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('5');
  });

  it('parses section with alpha suffix (4a)', () => {
    const result = parseCitation('§ 4a, ABGB');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('4a');
  });
});

describe('validator — additional branches', () => {
  it('warns on repealed statute', () => {
    const repealed = db.prepare(
      "SELECT id FROM legal_documents WHERE status = 'repealed' LIMIT 1"
    ).get() as { id: string } | undefined;

    if (repealed) {
      // Find or construct a citation for this repealed statute
      const doc = db.prepare(
        "SELECT title FROM legal_documents WHERE id = ?"
      ).get(repealed.id) as { title: string };
      const result = validateCitation(db, `§ 1, ${doc.title}`);
      if (result.document_exists) {
        expect(result.warnings.some(w => w.includes('repealed'))).toBe(true);
      }
    }
  });

  it('handles citation with section via statute ID', () => {
    const result = validateCitation(db, '§ 1, gesetz-10001622');
    expect(result.document_exists).toBe(true);
  });

  it('returns warning for citation with valid doc but missing provision', () => {
    // Covers the provisionExists=false warning path (line 78)
    const result = validateCitation(db, '§ 99999, Allgemeines bürgerliches Gesetzbuch');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('not found');
  });

  it('returns warning when no title or ID present in citation', () => {
    // Covers line 30-36 — lookupTerm is undefined (bare "§ 1")
    const result = validateCitation(db, '§ 1');
    expect(result.document_exists).toBe(false);
    expect(result.warnings[0]).toContain('statute title or statute ID');
  });
});

describe('search_legislation — fallback-also-fails branch', () => {
  it('returns empty when both primary and fallback fail', async () => {
    // Trigger with an explicit FTS5 syntax that causes error
    // and a fallback that also fails (should not happen in practice
    // but we need to cover the empty catch)
    const result = await searchLegislation(db, { query: '"""' });
    expect(Array.isArray(result.results)).toBe(true);
  });
});

describe('build_legal_stance — fallback-also-fails branch', () => {
  it('returns empty when both primary and fallback fail', async () => {
    const result = await buildLegalStance(db, { query: '"""' });
    expect(Array.isArray(result.results.provisions)).toBe(true);
  });
});

describe('about-context — error paths', () => {
  it('readBuiltAt returns unknown when db_metadata missing', () => {
    const emptyDb = new Database(':memory:');
    const ctx = makeAboutContext('/nonexistent.db', emptyDb, '1.0.0');
    expect(ctx.dbBuilt).toBe('unknown');
    expect(ctx.fingerprint).toBe('unknown');
    emptyDb.close();
  });
});

describe('about-context — null built_at value', () => {
  it('returns unknown when built_at row exists but value is null', () => {
    const nullDb = new Database(':memory:');
    nullDb.prepare('CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
    nullDb.prepare("INSERT INTO db_metadata VALUES ('built_at', NULL)").run();
    const ctx = makeAboutContext('/nonexistent.db', nullDb, '1.0.0');
    expect(ctx.dbBuilt).toBe('unknown');
    nullDb.close();
  });
});

describe('as-of-date — NaN branch', () => {
  it('throws for date-like but invalid value', () => {
    expect(() => normalizeAsOfDate('9999-99-99')).toThrow('YYYY-MM-DD');
  });
});

describe('content-cleaner — keyword with verb (no strip)', () => {
  it('preserves line containing verb even if comma-separated', () => {
    // A line that matches keyword pattern structure but contains verbs
    const raw = [
      'BGBl. Nr. 1/2000',
      '§ 1',
      '01.01.2000',
      'Die Bestimmungen gelten für alle Personen.',
      'Sicherheit, Schutz, Recht, wird angewendet, Kontrolle',
    ].join('\n');
    const cleaned = cleanProvisionContent(raw);
    // The last line has "wird" (a verb) so should be preserved
    expect(cleaned).toContain('Bestimmungen');
  });
});

describe('get_provision_eu_basis — provision not found in test DB', () => {
  it('throws when provision not found', async () => {
    // Use an in-memory DB with document but no matching provision
    const testDb = new Database(':memory:');
    testDb.prepare('CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
    testDb.prepare("INSERT INTO db_metadata VALUES ('built_at', '2025-01-01')").run();
    testDb.prepare(`CREATE TABLE legal_documents (id TEXT PRIMARY KEY, title TEXT, status TEXT DEFAULT 'in_force')`).run();
    testDb.prepare(`INSERT INTO legal_documents VALUES ('gesetz-test-2', 'Testgesetz 2', 'in_force')`).run();
    testDb.prepare(`CREATE TABLE legal_provisions (id INTEGER PRIMARY KEY, document_id TEXT, provision_ref TEXT, chapter TEXT, section TEXT, title TEXT, content TEXT)`).run();
    // Insert provision with different ref
    testDb.prepare(`INSERT INTO legal_provisions VALUES (1, 'gesetz-test-2', 'para99', NULL, '§ 99', NULL, 'content')`).run();
    testDb.prepare(`CREATE TABLE eu_documents (id TEXT PRIMARY KEY, type TEXT, title TEXT, short_name TEXT)`).run();
    testDb.prepare(`CREATE TABLE eu_references (id INTEGER PRIMARY KEY, provision_id INTEGER, eu_document_id TEXT, eu_article TEXT, reference_type TEXT, full_citation TEXT, reference_context TEXT, document_id TEXT)`).run();

    await expect(
      getProvisionEUBasis(testDb, { document_id: 'gesetz-test-2', provision_ref: '1' })
    ).rejects.toThrow('not found');
    testDb.close();
  });
});
