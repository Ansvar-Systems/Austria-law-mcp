/**
 * Tool registry for Austrian Law MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation, SearchLegislationInput } from './search-legislation.js';
import { getProvision, GetProvisionInput } from './get-provision.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './check-currency.js';
import { listSources } from './list-sources.js';
import { getEUBasis, GetEUBasisInput } from './get-eu-basis.js';
import { getAustrianImplementations, GetAustrianImplementationsInput } from './get-austrian-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getAbout, type AboutContext } from './about.js';
export type { AboutContext } from './about.js';

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this first to verify data coverage, currency, and content basis before relying on results. ' +
    'Returns document/provision counts, database build date, and source authority. ' +
    'Do NOT use this to search for legislation — use search_legislation instead.',
  inputSchema: { type: 'object', properties: {} },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description:
      'Search Austrian statutes and regulations by keyword. Returns matching provisions with BM25-ranked snippets. ' +
      'Supports FTS5 syntax: quoted phrases ("exact match"), boolean operators (AND, OR, NOT), and prefix wildcards (Daten*). ' +
      'Returns: document title, provision reference (§), snippet with >>> <<< markers, and relevance score. ' +
      'Coverage: subset of Austrian federal law — call list_sources to check document_count. Not all statutes are included. ' +
      'Use this for discovery when you do not know the exact statute or section. ' +
      'Do NOT use this to retrieve full provision text — use get_provision instead once you know the document_id and section.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in German. Supports FTS5 syntax: "Datenschutz" (exact), Daten* (prefix), Sicherheit AND Netzwerk (boolean). Plain text searches as phrase with fallback to OR.',
        },
        document_id: {
          type: 'string',
          description: 'Filter results to a specific statute by its ID (e.g., "gesetz-10001597") or title. Optional.',
        },
        status: {
          type: 'string',
          enum: ['in_force', 'amended', 'repealed'],
          description: 'Filter by statute status. Omit to search all statuses.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return.',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve the full text of a specific provision (§) from an Austrian statute. ' +
      'If only document_id is provided (no section/provision_ref), returns all provisions in the statute (capped at 200). ' +
      'Austrian citations use § notation: § 1 ABGB, § 4 DSG. ' +
      'Use this after search_legislation has identified the relevant statute and section. ' +
      'Do NOT use this for keyword search — use search_legislation instead.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Statute identifier (e.g., "gesetz-10001622") or title/short name (e.g., "ABGB", "Datenschutzgesetz"). The server resolves both.',
        },
        section: {
          type: 'string',
          description: 'Section number to retrieve (e.g., "1", "4a", "12"). Maps to § number in Austrian law.',
        },
        provision_ref: {
          type: 'string',
          description: 'Direct provision reference if known (e.g., "para1", "para4a"). Prefer using section instead.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate an Austrian legal citation against the database. Zero-hallucination check — confirms whether the cited document and provision actually exist. ' +
      'Returns: document_exists, provision_exists, document_title, status, and warnings. ' +
      'Use this BEFORE presenting a citation to a user to ensure accuracy. ' +
      'Do NOT use this for formatting — use format_citation instead.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Austrian citation string to validate. Supported formats: "§ 1, Allgemeines bürgerliches Gesetzbuch", "§ 4 DSG", "para1, ABGB".',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description:
      'Build a comprehensive set of citations for a legal question by searching across all Austrian statutes simultaneously. ' +
      'Aggregates relevant provisions from multiple statutes — use for broad research questions. ' +
      'Returns results grouped by relevance with full citation metadata. ' +
      'Use this for open-ended legal research where multiple statutes may apply. ' +
      'Do NOT use this for single-statute lookups — use get_provision or search_legislation instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Legal question or topic to research in German (e.g., "Datenschutz im Arbeitsverhältnis", "Cybersicherheit kritische Infrastruktur").',
        },
        document_id: {
          type: 'string',
          description: 'Optionally limit search to a single statute by ID or title.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results per category.',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description:
      'Format an Austrian legal citation per standard conventions. ' +
      'Outputs: full ("§ 1, Allgemeines bürgerliches Gesetzbuch"), short ("§ 1 ABGB"), or pinpoint ("§ 1") style. ' +
      'Use this for presentation after validating with validate_citation. ' +
      'Do NOT use this for validation — use validate_citation first to check existence.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Citation string to format (e.g., "§ 1, ABGB").',
        },
        format: {
          type: 'string',
          enum: ['full', 'short', 'pinpoint'],
          description: 'Output format style.',
          default: 'full',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description:
      'Check whether an Austrian statute or specific provision is currently in force (geltende Fassung). ' +
      'Returns: status (in_force/amended/repealed), issued_date, in_force_date, and warnings. ' +
      'Supports historical queries via as_of_date parameter. ' +
      'Use this to verify a statute is still valid before citing it. ' +
      'Do NOT use this for text retrieval — use get_provision to read the actual content.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Statute identifier or title (e.g., "gesetz-10001622", "ABGB", "Datenschutzgesetz").',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check (e.g., "1", "4a"). If provided, also verifies the provision exists.',
        },
        as_of_date: {
          type: 'string',
          description: 'Optional historical date in ISO format (YYYY-MM-DD). Returns status as of that date.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'list_sources',
    description:
      'List all data sources, their provenance metadata, and database statistics. ' +
      'Returns: source authority, API details, license, update frequency, and database tier/schema/counts. ' +
      'Use this to understand what data is available and how current it is. ' +
      'Do NOT use this for server metadata — use the about tool instead.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_eu_basis',
    description:
      'Get EU legal basis (directives and regulations) for an Austrian statute. ' +
      'Returns: EU document type, year, CELEX number, reference type (implements/supplements/applies/cites), and primary implementation flag. ' +
      'Note: EU cross-reference data may be incomplete — call list_sources to check eu_document_count before relying on results. ' +
      'Use this to find which EU law an Austrian statute implements. ' +
      'Do NOT use this to search EU documents by keyword — use search_eu_implementations instead.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Austrian statute identifier or title (e.g., "gesetz-10001597", "DSG").',
        },
        include_articles: {
          type: 'boolean',
          description: 'Include specific EU article references in results. Default: false.',
          default: false,
        },
        reference_types: {
          type: 'array',
          items: { type: 'string', enum: ['implements', 'supplements', 'applies', 'cites', 'cites_article'] },
          description: 'Filter by reference type. Omit to return all types.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_austrian_implementations',
    description:
      'Find Austrian statutes that implement a specific EU directive or regulation. ' +
      'Given a EU document ID (e.g., "regulation:2016/679" for GDPR), returns all Austrian statutes referencing it. ' +
      'Shows implementation status and which articles are referenced. ' +
      'Note: EU cross-reference data may be incomplete — empty results may mean data is not yet ingested, not that no implementation exists. ' +
      'Use this when you have a specific EU document and want to find Austrian law. ' +
      'Do NOT use this for keyword search — use search_eu_implementations for discovery.',
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: {
          type: 'string',
          description: 'EU document ID in format "type:year/number" (e.g., "regulation:2016/679" for GDPR, "directive:2016/1148" for NIS).',
        },
        primary_only: {
          type: 'boolean',
          description: 'Return only primary implementing statutes (not secondary references). Default: false.',
          default: false,
        },
        in_force_only: {
          type: 'boolean',
          description: 'Return only currently in-force statutes. Default: false.',
          default: false,
        },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description:
      'Search for EU directives and regulations with Austrian implementation information. ' +
      'Use for discovery: search by keyword, filter by type/year/community. Returns matching EU documents with counts of Austrian statutes referencing them. ' +
      'Note: EU cross-reference data may be incomplete — call list_sources to check eu_document_count first. ' +
      'Do NOT use this if you already know the EU document — use get_austrian_implementations directly.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword search across EU document titles and short names (e.g., "data protection", "cybersecurity").',
        },
        type: {
          type: 'string',
          enum: ['directive', 'regulation'],
          description: 'Filter by EU document type.',
        },
        year_from: {
          type: 'number',
          description: 'Filter: minimum year of EU document.',
          minimum: 1950,
        },
        year_to: {
          type: 'number',
          description: 'Filter: maximum year of EU document.',
          maximum: 2030,
        },
        has_austrian_implementation: {
          type: 'boolean',
          description: 'If true, only return EU documents with at least one Austrian implementing statute.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return.',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description:
      'Get EU legal basis for a specific provision within an Austrian statute. ' +
      'Returns EU directives/regulations that a specific provision implements, with article-level precision. ' +
      'Note: EU cross-reference data may be incomplete. ' +
      'Use this for pinpoint EU compliance checks at the provision level. ' +
      'Do NOT use this for statute-level EU basis — use get_eu_basis instead.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Austrian statute identifier or title.',
        },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g., "1", "4a"). Maps to § number.',
        },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description:
      'Check EU compliance status for an Austrian statute or provision. ' +
      'Checks for: references to repealed EU directives, missing implementation status, outdated references. ' +
      'Returns compliance status (compliant, partial, unclear, not_applicable) with warnings and recommendations. ' +
      'Note: EU cross-reference data may be incomplete — "not_applicable" may mean data is not yet ingested. ' +
      'Use this for compliance auditing. ' +
      'Do NOT use this to find EU basis — use get_eu_basis or get_provision_eu_basis first.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Austrian statute identifier or title.',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check a specific section.',
        },
        eu_document_id: {
          type: 'string',
          description: 'Optional: check compliance with a specific EU document (e.g., "regulation:2016/679").',
        },
      },
      required: ['document_id'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context ? [...TOOLS, ABOUT_TOOL] : TOOLS;
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(db, args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(db, args as unknown as GetProvisionInput);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(db, args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(db, args as unknown as CheckCurrencyInput);
          break;
        case 'list_sources':
          result = await listSources(db);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(db, args as unknown as GetEUBasisInput);
          break;
        case 'get_austrian_implementations':
          result = await getAustrianImplementations(db, args as unknown as GetAustrianImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(db, args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(db, args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(db, args as unknown as ValidateEUComplianceInput);
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : /* istanbul ignore next */ String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
