/**
 * check_currency — Check if an Austrian statute is current (in force).
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { buildProvisionLookupCandidates } from '../utils/provision-candidates.js';

export interface CheckCurrencyInput {
  document_id: string;
  provision_ref?: string;
  as_of_date?: string;
}

export interface CurrencyResult {
  document_id: string;
  title: string;
  status: string;
  type: string;
  issued_date: string | null;
  in_force_date: string | null;
  is_current: boolean;
  provision_exists?: boolean;
  warnings: string[];
}

interface DocumentRow {
  id: string;
  title: string;
  status: string;
  document_type: string;
  issued_date: string | null;
  in_force_date: string | null;
}

export async function checkCurrency(
  db: Database,
  input: CheckCurrencyInput
): Promise<ToolResponse<CurrencyResult | null>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  if (input.as_of_date) {
    normalizeAsOfDate(input.as_of_date);
  }

  const resolvedDocumentId = resolveExistingStatuteId(db, input.document_id);

  // Escape SQL LIKE wildcards in user input to prevent unintended pattern matching
  const escapedId = input.document_id.replace(/[%_]/g, '\\$&');
  const doc = db.prepare(`
    SELECT id, title, status, type as document_type, issued_date, in_force_date
    FROM legal_documents
    WHERE id = ? OR title LIKE ? ESCAPE '\\'
    LIMIT 1
  `).get(
    resolvedDocumentId ?? input.document_id,
    `%${escapedId}%`,
  ) as DocumentRow | undefined;

  if (!doc) {
    return {
      results: null,
      _metadata: generateResponseMetadata(db)
    };
  }

  const warnings: string[] = [];
  const isCurrent = doc.status === 'in_force';

  if (doc.status === 'repealed') {
    warnings.push('This statute has been repealed');
  }

  let provisionExists: boolean | undefined;
  if (input.provision_ref) {
    const candidates = buildProvisionLookupCandidates(input.provision_ref);
    const where = [
      ...candidates.provisionRefs.map(() => 'provision_ref = ?'),
      ...candidates.sections.map(() => 'section = ?'),
    ];
    const params = [...candidates.provisionRefs, ...candidates.sections];
    const prov = db.prepare(
      `
      SELECT 1 FROM legal_provisions
      WHERE document_id = ?
        AND (${where.join(' OR ')})
      LIMIT 1
      `
    ).get(doc.id, ...params);
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Provision "${input.provision_ref}" not found in this document`);
    }
  }

  return {
    results: {
      document_id: doc.id,
      title: doc.title,
      status: doc.status,
      type: doc.document_type,
      issued_date: doc.issued_date,
      in_force_date: doc.in_force_date,
      is_current: isCurrent,
      provision_exists: provisionExists,
      warnings,
    },
    _metadata: generateResponseMetadata(db)
  };
}
