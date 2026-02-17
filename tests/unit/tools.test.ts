import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

import { buildTools } from '../../src/tools/registry.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { makeAboutContext } from '../../src/utils/about-context.js';
import { SERVER_VERSION } from '../../src/server-info.js';

let db: InstanceType<typeof Database>;

describe('Tool registry and retrieval behavior', () => {
  beforeAll(() => {
    db = new Database('data/database.db', { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  it('includes about tool when context is provided', () => {
    const context = makeAboutContext('data/database.db', db, SERVER_VERSION);
    const tools = buildTools(context);
    expect(tools.some(tool => tool.name === 'about')).toBe(true);
  });

  it('omits about tool when context is not provided', () => {
    const tools = buildTools();
    expect(tools.some(tool => tool.name === 'about')).toBe(false);
  });

  it('resolves numeric section input in get_provision', async () => {
    const result = await getProvision(db, {
      document_id: 'gesetz-10001622',
      section: '1',
    });

    expect(result.results).toBeTruthy();
    const provision = result.results as { document_id: string; section: string };
    expect(provision.document_id).toBe('gesetz-10001622');
    expect(provision.section).toMatch(/1/);
  });

  it('resolves numeric provision input in check_currency', async () => {
    const result = await checkCurrency(db, {
      document_id: 'gesetz-10001622',
      provision_ref: '1',
    });

    expect(result.results).toBeTruthy();
    const currency = result.results as { provision_exists?: boolean; warnings: string[] };
    expect(currency.provision_exists).toBe(true);
    expect(currency.warnings).not.toContain('Provision "1" not found in this document');
  });

  it('resolves section-style input in get_provision_eu_basis', async () => {
    const result = await getProvisionEUBasis(db, {
      document_id: 'gesetz-10001622',
      provision_ref: '§1',
    });

    expect(result.results.document_id).toBe('gesetz-10001622');
    expect(Array.isArray(result.results.eu_references)).toBe(true);
  });

  it('does not mark valid provisions as missing in validate_eu_compliance', async () => {
    const result = await validateEUCompliance(db, {
      document_id: 'gesetz-10001622',
      provision_ref: '1',
    });

    expect(result.results.document_id).toBe('gesetz-10001622');
    expect(result.results.warnings.join(' ')).not.toContain('not found');
  });
});
