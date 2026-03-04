/**
 * Austrian legal citation validator.
 *
 * Validates a citation string against the database to ensure the document
 * and provision actually exist (zero-hallucination enforcement).
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ValidationResult } from '../types/index.js';
import { parseCitation } from './parser.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';
import { buildProvisionLookupCandidates } from '../utils/provision-candidates.js';

export function validateCitation(db: Database, citation: string): ValidationResult {
  const parsed = parseCitation(citation);
  const warnings: string[] = [];

  if (!parsed.valid) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [parsed.error ?? 'Invalid citation format'],
    };
  }

  const explicitId = citation.match(/\bgesetz-\d+\b/i)?.[0];
  const lookupTerm = parsed.title ?? explicitId;

  if (!lookupTerm) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: ['Citation must include either a statute title or statute ID (e.g. gesetz-10001622).'],
    };
  }

  const resolvedId = resolveExistingStatuteId(db, lookupTerm);
  const doc = resolvedId
    ? (db.prepare(
      'SELECT id, title, status FROM legal_documents WHERE id = ? LIMIT 1'
    ).get(resolvedId) as { id: string; title: string; status: string } | undefined)
    : undefined;

  if (!doc) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${lookupTerm}" not found in database`],
    };
  }

  if (doc.status === 'repealed') {
    warnings.push('This statute has been repealed');
  }

  // Check provision existence (document-level citations without section default to true)
  let provisionExists = !parsed.section;
  if (parsed.section) {
    const candidates = buildProvisionLookupCandidates(parsed.section);
    const whereClauses = [
      ...candidates.provisionRefs.map(() => 'provision_ref = ?'),
      ...candidates.sections.map(() => 'section = ?'),
    ];
    const params: string[] = [...candidates.provisionRefs, ...candidates.sections];
    const sql = `
      SELECT 1 FROM legal_provisions
      WHERE document_id = ?
        AND (${whereClauses.join(' OR ')})
      LIMIT 1
    `;
    const prov = db.prepare(sql).get(doc.id, ...params);
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Section § ${parsed.section} not found in ${doc.title}`);
    }
  }

  return {
    citation: parsed,
    document_exists: true,
    provision_exists: provisionExists,
    document_title: doc.title,
    status: doc.status,
    warnings,
  };
}
