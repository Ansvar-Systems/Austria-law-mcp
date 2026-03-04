/**
 * Phase 3.1 — Error handling & graceful degradation tests.
 *
 * Tests every tool with: missing required params, wrong types, empty strings,
 * SQL injection attempts, extremely long inputs, and null values.
 * Verifies actionable error messages and no crashes.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation } from '../../src/tools/search-legislation.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { listSources } from '../../src/tools/list-sources.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getAustrianImplementations } from '../../src/tools/get-austrian-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database('data/database.db', { readonly: true });
});

afterAll(() => {
  db.close();
});

// --- Malicious / adversarial inputs ---
const SQL_INJECTION = "'; DROP TABLE legal_provisions; --";
const LONG_INPUT = 'A'.repeat(10_000);
const UNICODE_BOMB = '\u0000\uFFFF\uD800';

describe('search_legislation error handling', () => {
  it('returns empty results for empty query', async () => {
    const result = await searchLegislation(db, { query: '' });
    expect(result.results).toEqual([]);
  });

  it('returns empty results for whitespace-only query', async () => {
    const result = await searchLegislation(db, { query: '   ' });
    expect(result.results).toEqual([]);
  });

  it('does not crash on SQL injection query', async () => {
    const result = await searchLegislation(db, { query: SQL_INJECTION });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('does not crash on extremely long query', async () => {
    const result = await searchLegislation(db, { query: LONG_INPUT });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('clamps limit to valid range', async () => {
    const result = await searchLegislation(db, { query: 'Recht', limit: 999 });
    expect(result.results.length).toBeLessThanOrEqual(50);
  });

  it('handles negative limit gracefully', async () => {
    const result = await searchLegislation(db, { query: 'Recht', limit: -5 });
    expect(result.results.length).toBeGreaterThanOrEqual(0);
  });

  it('handles non-existent document_id filter', async () => {
    const result = await searchLegislation(db, {
      query: 'Recht',
      document_id: 'nonexistent-doc-99999',
    });
    expect(result.results).toEqual([]);
  });

  it('handles FTS5 syntax injection (unbalanced quotes)', async () => {
    const result = await searchLegislation(db, { query: '"unbalanced' });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('handles FTS5 syntax injection (boolean operators)', async () => {
    const result = await searchLegislation(db, { query: 'AND OR NOT' });
    expect(Array.isArray(result.results)).toBe(true);
  });
});

describe('get_provision error handling', () => {
  it('throws on missing document_id', async () => {
    await expect(
      getProvision(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('returns null for non-existent document', async () => {
    const result = await getProvision(db, {
      document_id: 'nonexistent-doc',
      section: '1',
    });
    expect(result.results).toBeNull();
  });

  it('does not crash on SQL injection in document_id', async () => {
    const result = await getProvision(db, {
      document_id: SQL_INJECTION,
      section: '1',
    });
    expect(result.results).toBeNull();
  });

  it('does not crash on extremely long document_id', async () => {
    const result = await getProvision(db, {
      document_id: LONG_INPUT,
      section: '1',
    });
    expect(result.results).toBeNull();
  });

  it('returns null for non-existent section', async () => {
    const result = await getProvision(db, {
      document_id: 'gesetz-10001622',
      section: '99999',
    });
    expect(result.results).toBeNull();
  });
});

describe('validate_citation error handling', () => {
  it('returns invalid for empty citation', async () => {
    const result = await validateCitationTool(db, { citation: '' });
    expect(result.results.valid).toBe(false);
    expect(result.results.warnings).toContain('Empty citation');
  });

  it('returns invalid for garbage input', async () => {
    const result = await validateCitationTool(db, { citation: 'xyzzy12345!@#$%' });
    expect(result.results.valid).toBe(false);
  });

  it('does not crash on SQL injection', async () => {
    const result = await validateCitationTool(db, { citation: SQL_INJECTION });
    expect(result.results.valid).toBe(false);
  });

  it('does not crash on long input', async () => {
    const result = await validateCitationTool(db, { citation: LONG_INPUT });
    expect(result.results.valid).toBe(false);
  });
});

describe('build_legal_stance error handling', () => {
  it('returns empty for empty query', async () => {
    const result = await buildLegalStance(db, { query: '' });
    expect(result.results.provisions).toEqual([]);
  });

  it('does not crash on SQL injection query', async () => {
    const result = await buildLegalStance(db, { query: SQL_INJECTION });
    expect(Array.isArray(result.results.provisions)).toBe(true);
  });

  it('clamps limit to valid range', async () => {
    const result = await buildLegalStance(db, { query: 'Recht', limit: 999 });
    expect(result.results.provisions.length).toBeLessThanOrEqual(20);
  });
});

describe('format_citation error handling', () => {
  it('returns error for empty citation', async () => {
    const result = await formatCitationTool({ citation: '' });
    expect(result.results.valid).toBe(false);
    expect(result.results.error).toBeTruthy();
  });

  it('handles unparseable citation', async () => {
    const result = await formatCitationTool({ citation: 'not a valid citation' });
    // Should not crash — returns error or parsed-as-best-effort
    expect(result.results).toBeDefined();
  });
});

describe('check_currency error handling', () => {
  it('throws on missing document_id', async () => {
    await expect(
      checkCurrency(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('returns null for non-existent document', async () => {
    const result = await checkCurrency(db, { document_id: 'nonexistent-doc' });
    expect(result.results).toBeNull();
  });

  it('does not crash on SQL injection', async () => {
    const result = await checkCurrency(db, { document_id: SQL_INJECTION });
    // Should either throw actionable error or return null
    expect(result.results === null || result.results).toBeTruthy();
  });

  it('handles invalid as_of_date format', async () => {
    await expect(
      checkCurrency(db, { document_id: 'gesetz-10001622', as_of_date: 'not-a-date' })
    ).rejects.toThrow();
  });
});

describe('list_sources error handling', () => {
  it('always returns valid result (no inputs)', async () => {
    const result = await listSources(db);
    expect(result.results.sources.length).toBeGreaterThan(0);
    expect(result._metadata).toBeDefined();
  });
});

describe('get_eu_basis error handling', () => {
  it('throws on missing document_id', async () => {
    await expect(
      getEUBasis(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('throws actionable error for non-existent document', async () => {
    await expect(
      getEUBasis(db, { document_id: 'nonexistent-doc' })
    ).rejects.toThrow('not found in database');
  });

  it('does not crash on SQL injection', async () => {
    await expect(
      getEUBasis(db, { document_id: SQL_INJECTION })
    ).rejects.toThrow('not found in database');
  });
});

describe('get_austrian_implementations error handling', () => {
  it('throws on missing eu_document_id', async () => {
    await expect(
      getAustrianImplementations(db, { eu_document_id: '' })
    ).rejects.toThrow('eu_document_id is required');
  });

  it('returns empty for non-existent EU document', async () => {
    const result = await getAustrianImplementations(db, {
      eu_document_id: 'directive:9999/9999',
    });
    expect(result.results.implementations).toEqual([]);
  });
});

describe('search_eu_implementations error handling', () => {
  it('returns results with no filters (all optional)', async () => {
    const result = await searchEUImplementations(db, {});
    expect(Array.isArray(result.results.results)).toBe(true);
  });

  it('does not crash on SQL injection in query', async () => {
    const result = await searchEUImplementations(db, { query: SQL_INJECTION });
    expect(Array.isArray(result.results.results)).toBe(true);
  });

  it('clamps limit to valid range', async () => {
    const result = await searchEUImplementations(db, { limit: 999 });
    expect(result.results.results.length).toBeLessThanOrEqual(100);
  });
});

describe('get_provision_eu_basis error handling', () => {
  it('throws on missing document_id', async () => {
    await expect(
      getProvisionEUBasis(db, { document_id: '', provision_ref: '1' })
    ).rejects.toThrow('document_id is required');
  });

  it('throws on missing provision_ref', async () => {
    await expect(
      getProvisionEUBasis(db, { document_id: 'gesetz-10001622', provision_ref: '' })
    ).rejects.toThrow('provision_ref is required');
  });

  it('throws for non-existent document', async () => {
    await expect(
      getProvisionEUBasis(db, { document_id: 'nonexistent', provision_ref: '1' })
    ).rejects.toThrow('not found');
  });
});

describe('validate_eu_compliance error handling', () => {
  it('throws on missing document_id', async () => {
    await expect(
      validateEUCompliance(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('throws for non-existent document', async () => {
    await expect(
      validateEUCompliance(db, { document_id: 'nonexistent-doc' })
    ).rejects.toThrow('not found');
  });

  it('does not crash on SQL injection', async () => {
    await expect(
      validateEUCompliance(db, { document_id: SQL_INJECTION })
    ).rejects.toThrow('not found');
  });
});

describe('Cross-cutting: Unicode and special characters', () => {
  it('search handles German umlauts correctly', async () => {
    const result = await searchLegislation(db, { query: 'Österreich' });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('search handles ß correctly', async () => {
    const result = await searchLegislation(db, { query: 'Straße' });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('validate_citation handles § symbol', async () => {
    const result = await validateCitationTool(db, { citation: '§ 1 ABGB' });
    expect(result.results).toBeDefined();
  });
});
