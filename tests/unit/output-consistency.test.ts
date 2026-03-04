import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation } from '../../src/tools/search-legislation.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getAustrianImplementations } from '../../src/tools/get-austrian-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { listSources } from '../../src/tools/list-sources.js';
import { getAbout } from '../../src/tools/about.js';
import { makeAboutContext } from '../../src/utils/about-context.js';
import { SERVER_VERSION } from '../../src/server-info.js';

let db: InstanceType<typeof Database>;

function assertMetadataShape(response: unknown) {
  expect(response).toBeDefined();
  const payload = response as { _metadata?: Record<string, string> };
  expect(payload._metadata).toBeDefined();
  expect(payload._metadata?.data_freshness).toBeTypeOf('string');
  expect(payload._metadata?.disclaimer).toBeTypeOf('string');
  expect(payload._metadata?.source_authority).toBeTypeOf('string');
}

describe('Tool output consistency', () => {
  beforeAll(() => {
    db = new Database('data/database.db', { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  it('includes metadata for all tool responses', async () => {
    const about = getAbout(db, makeAboutContext('data/database.db', db, SERVER_VERSION));
    const search = await searchLegislation(db, { query: 'Sicherheit', limit: 1 });
    const provision = await getProvision(db, { document_id: 'gesetz-10001622', provision_ref: '1' });
    const citation = await validateCitationTool(db, { citation: '§ 1, Allgemeines bürgerliches Gesetzbuch' });
    const stance = await buildLegalStance(db, { query: 'Datenschutz', limit: 1 });
    const formatted = await formatCitationTool({ citation: '§ 1, Allgemeines bürgerliches Gesetzbuch', format: 'full' });
    const currency = await checkCurrency(db, { document_id: 'gesetz-10001622', provision_ref: '1' });
    const euBasis = await getEUBasis(db, { document_id: 'gesetz-10001622' });
    const atImpl = await getAustrianImplementations(db, { eu_document_id: 'directive:2016/680' });
    const searchImpl = await searchEUImplementations(db, { query: 'privacy', limit: 1 });
    const provisionBasis = await getProvisionEUBasis(db, { document_id: 'gesetz-10001622', provision_ref: '§1' });
    const compliance = await validateEUCompliance(db, { document_id: 'gesetz-10001622', provision_ref: '1' });
    const sources = await listSources(db);

    assertMetadataShape(about);
    assertMetadataShape(sources);
    assertMetadataShape(search);
    assertMetadataShape(provision);
    assertMetadataShape(citation);
    assertMetadataShape(stance);
    assertMetadataShape(formatted);
    assertMetadataShape(currency);
    assertMetadataShape(euBasis);
    assertMetadataShape(atImpl);
    assertMetadataShape(searchImpl);
    assertMetadataShape(provisionBasis);
    assertMetadataShape(compliance);
  });
});
