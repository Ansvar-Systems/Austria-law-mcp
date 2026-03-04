/**
 * get_provision_eu_basis — Get EU legal basis for a specific Austrian provision.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ProvisionEUReference } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';
import { buildProvisionLookupCandidates } from '../utils/provision-candidates.js';
import { cleanProvisionContent } from '../utils/content-cleaner.js';

export interface GetProvisionEUBasisInput {
  document_id: string;
  provision_ref: string;
}

export interface GetProvisionEUBasisResult {
  document_id: string;
  provision_ref: string;
  provision_content?: string;
  eu_references: ProvisionEUReference[];
}

export async function getProvisionEUBasis(
  db: Database,
  input: GetProvisionEUBasisInput
): Promise<ToolResponse<GetProvisionEUBasisResult>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }
  if (!input.provision_ref?.trim()) {
    throw new Error('provision_ref is required');
  }

  const resolvedId = resolveExistingStatuteId(db, input.document_id);
  if (!resolvedId) {
    throw new Error(`Document "${input.document_id}" not found in database`);
  }

  const candidates = buildProvisionLookupCandidates(input.provision_ref);
  const where = [
    ...candidates.provisionRefs.map(() => 'provision_ref = ?'),
    ...candidates.sections.map(() => 'section = ?'),
  ];
  const params = [...candidates.provisionRefs, ...candidates.sections];

  const provision = db.prepare(
    `
    SELECT id, content
    FROM legal_provisions
    WHERE document_id = ?
      AND (${where.join(' OR ')})
    LIMIT 1
    `
  ).get(resolvedId, ...params) as { id: number; content: string } | undefined;

  if (!provision) {
    throw new Error(`Provision ${input.provision_ref} not found in ${input.document_id}`);
  }

  const sql = `
    SELECT ed.id, ed.type, ed.title, ed.short_name, er.eu_article,
           er.reference_type, er.full_citation, er.reference_context
    FROM eu_documents ed
    JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE er.provision_id = ?
    ORDER BY ed.year DESC
  `;

  interface Row {
    id: string; type: 'directive' | 'regulation'; title: string | null;
    short_name: string | null; eu_article: string | null;
    reference_type: string; full_citation: string | null; reference_context: string | null;
  }

  const rows = db.prepare(sql).all(provision.id) as Row[];

  return {
    results: {
      document_id: resolvedId,
      provision_ref: input.provision_ref,
      provision_content: cleanProvisionContent(provision.content),
      eu_references: rows.map(r => {
        const ref: ProvisionEUReference = {
          id: r.id, type: r.type,
          reference_type: r.reference_type as any,
          full_citation: r.full_citation || r.id,
        };
        if (r.title) ref.title = r.title;
        if (r.short_name) ref.short_name = r.short_name;
        if (r.eu_article) ref.article = r.eu_article;
        if (r.reference_context) ref.context = r.reference_context;
        return ref;
      }),
    },
    _metadata: generateResponseMetadata(db),
  };
}
