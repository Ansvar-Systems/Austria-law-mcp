import type Database from '@ansvar/mcp-sqlite';
import { REPOSITORY_URL, SERVER_PACKAGE } from '../server-info.js';
import { generateResponseMetadata, type ResponseMetadata } from '../utils/metadata.js';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

export interface AboutResult {
  server: {
    name: string;
    package: string;
    version: string;
    suite: string;
    repository: string;
  };
  dataset: {
    fingerprint: string;
    built: string;
    jurisdiction: string;
    content_basis: string;
    counts: Record<string, number>;
  };
  provenance: {
    sources: string[];
    license: string;
    authenticity_note: string;
  };
  security: {
    access_model: string;
    network_access: boolean;
    filesystem_access: boolean;
    arbitrary_code: boolean;
  };
  _metadata: ResponseMetadata;
}

function safeCount(db: InstanceType<typeof Database>, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

export function getAbout(
  db: InstanceType<typeof Database>,
  context: AboutContext
): AboutResult {
  return {
    server: {
      name: 'Austrian Law MCP',
      package: SERVER_PACKAGE,
      version: context.version,
      suite: 'Ansvar Compliance Suite',
      repository: REPOSITORY_URL,
    },
    dataset: {
      fingerprint: context.fingerprint,
      built: context.dbBuilt,
      jurisdiction: 'Austria (AT)',
      content_basis:
        'Austrian statute text from RIS OGD open data. ' +
        'Covers cybersecurity, data protection, and related legislation.',
      counts: {
        legal_documents: safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents'),
        legal_provisions: safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions'),
        eu_documents: safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents'),
        eu_references: safeCount(db, 'SELECT COUNT(*) as count FROM eu_references'),
      },
    },
    provenance: {
      sources: [
        'RIS OGD (statutes, statutory instruments)',
        'EUR-Lex (EU directive references)',
      ],
      license:
        'Apache-2.0 (server code). Legal source texts under CC BY 4.0.',
      authenticity_note:
        'Statute text is derived from RIS OGD open data. ' +
        'Verify against official publications when legal certainty is required.',
    },
    security: {
      access_model: 'read-only',
      network_access: false,
      filesystem_access: false,
      arbitrary_code: false,
    },
    _metadata: generateResponseMetadata(db),
  };
}
