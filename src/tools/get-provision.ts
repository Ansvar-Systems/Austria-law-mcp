/**
 * get_provision — Retrieve a specific provision from an Austrian statute.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { resolveExistingStatuteId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { buildProvisionLookupCandidates } from '../utils/provision-candidates.js';
import { cleanProvisionContent } from '../utils/content-cleaner.js';

export interface GetProvisionInput {
  document_id: string;
  part?: string;
  chapter?: string;
  section?: string;
  provision_ref?: string;
}

export interface ProvisionResult {
  document_id: string;
  document_title: string;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
}

interface ProvisionRow {
  document_id: string;
  document_title: string;
  document_status: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  content: string;
}

export async function getProvision(
  db: Database,
  input: GetProvisionInput
): Promise<ToolResponse<ProvisionResult | ProvisionResult[] | null>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const resolvedDocumentId = resolveExistingStatuteId(db, input.document_id) ?? input.document_id;

  const provisionRef = input.provision_ref ?? input.section;

  // If no specific provision, return all provisions for the document (capped)
  const MAX_PROVISIONS = 200;
  if (!provisionRef) {
    const rows = db.prepare(`
      SELECT
        lp.document_id,
        ld.title as document_title,
        ld.status as document_status,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        lp.content
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.document_id = ?
      ORDER BY lp.order_index
      LIMIT ?
    `).all(resolvedDocumentId, MAX_PROVISIONS + 1) as ProvisionRow[];

    const truncated = rows.length > MAX_PROVISIONS;
    const results = (truncated ? rows.slice(0, MAX_PROVISIONS) : rows)
      .map(r => ({ ...r, content: cleanProvisionContent(r.content) }));

    return {
      results,
      ...(truncated && { _truncated: true, _total_hint: `More than ${MAX_PROVISIONS} provisions exist. Use section or provision_ref to retrieve specific provisions.` }),
      _metadata: generateResponseMetadata(db)
    };
  }

  const candidates = buildProvisionLookupCandidates(provisionRef);
  const where = [
    ...candidates.provisionRefs.map(() => 'lp.provision_ref = ?'),
    ...candidates.sections.map(() => 'lp.section = ?'),
  ];
  const params = [...candidates.provisionRefs, ...candidates.sections];

  const row = db.prepare(`
    SELECT
      lp.document_id,
      ld.title as document_title,
      ld.status as document_status,
      lp.provision_ref,
      lp.chapter,
      lp.section,
      lp.title,
      lp.content
    FROM legal_provisions lp
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE lp.document_id = ?
      AND (${where.join(' OR ')})
    LIMIT 1
  `).get(
    resolvedDocumentId,
    ...params,
  ) as ProvisionRow | undefined;

  if (!row) {
    return {
      results: null,
      _metadata: generateResponseMetadata(db)
    };
  }

  return {
    results: { ...row, content: cleanProvisionContent(row.content) },
    _metadata: generateResponseMetadata(db)
  };
}
