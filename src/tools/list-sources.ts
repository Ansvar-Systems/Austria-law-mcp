/**
 * list_sources — List all data sources and their provenance metadata.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ListSourcesResult {
  sources: DataSource[];
  database: DatabaseInfo;
}

export interface DataSource {
  name: string;
  authority: string;
  official_portal: string;
  api_documentation: string;
  retrieval_method: string;
  update_frequency: string;
  license: string;
  coverage: string;
  languages: string[];
}

export interface DatabaseInfo {
  tier: string;
  schema_version: string;
  jurisdiction: string;
  built_at: string | null;
  document_count: number;
  provision_count: number;
  eu_document_count: number;
  eu_reference_count: number;
}

function safeMetadata(db: Database, key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM db_metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function safeCount(db: Database, table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number } | undefined;
    return row ? Number(row.count) : /* istanbul ignore next */ 0;
  } catch {
    return 0;
  }
}

export async function listSources(
  db: Database,
): Promise<ToolResponse<ListSourcesResult>> {
  return {
    results: {
      sources: [
        {
          name: 'RIS OGD',
          authority: 'Federal Chancellery (Bundeskanzleramt)',
          official_portal: 'https://www.ris.bka.gv.at',
          api_documentation: 'https://data.bka.gv.at/ris/ogd/v2.6/',
          retrieval_method: 'API',
          update_frequency: 'weekly',
          license: 'CC BY 4.0',
          coverage: 'Austrian federal laws (cybersecurity and data protection scope)',
          languages: ['de'],
        },
      ],
      database: {
        tier: safeMetadata(db, 'tier') ?? 'free',
        schema_version: safeMetadata(db, 'schema_version') ?? 'unknown',
        jurisdiction: safeMetadata(db, 'jurisdiction') ?? 'AT',
        built_at: safeMetadata(db, 'built_at'),
        document_count: safeCount(db, 'legal_documents'),
        provision_count: safeCount(db, 'legal_provisions'),
        eu_document_count: safeCount(db, 'eu_documents'),
        eu_reference_count: safeCount(db, 'eu_references'),
      },
    },
    _metadata: generateResponseMetadata(db),
  };
}
