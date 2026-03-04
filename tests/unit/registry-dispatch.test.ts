/**
 * Registry dispatch tests.
 *
 * Tests the MCP tool dispatcher (switch statement in registerTools) by
 * extracting the CallTool handler and invoking each tool name through it.
 * Also covers error paths (unknown tool, tool throws, about without context).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import Database from '@ansvar/mcp-sqlite';
import { registerTools } from '../../src/tools/registry.js';
import { makeAboutContext } from '../../src/utils/about-context.js';
import { SERVER_VERSION } from '../../src/server-info.js';

let db: InstanceType<typeof Database>;

// Capture the CallTool handler by intercepting setRequestHandler
type HandlerFn = (request: any) => Promise<any>;

function captureCallToolHandler(
  db: InstanceType<typeof Database>,
  withContext = true,
): HandlerFn {
  const handlers: HandlerFn[] = [];

  const fakeServer = {
    setRequestHandler: (_schema: any, handler: HandlerFn) => {
      handlers.push(handler);
    },
  } as unknown as Server;

  const context = withContext
    ? makeAboutContext('data/database.db', db, SERVER_VERSION)
    : undefined;

  registerTools(fakeServer, db, context);

  // registerTools calls setRequestHandler twice:
  // [0] = ListToolsRequestSchema handler
  // [1] = CallToolRequestSchema handler
  const callToolHandler = handlers[1];
  if (!callToolHandler) {
    throw new Error('Failed to capture CallTool handler');
  }

  return callToolHandler;
}

function makeRequest(name: string, args: Record<string, any> = {}) {
  return { params: { name, arguments: args } };
}

beforeAll(() => {
  db = new Database('data/database.db', { readonly: true });
});

afterAll(() => {
  db.close();
});

describe('Registry dispatch — every tool', () => {
  let handler: HandlerFn;

  beforeAll(() => {
    handler = captureCallToolHandler(db, true);
  });

  it('dispatches search_legislation', async () => {
    const result = await handler(makeRequest('search_legislation', { query: 'Recht' }));
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
  });

  it('dispatches get_provision', async () => {
    const result = await handler(makeRequest('get_provision', {
      document_id: 'gesetz-10001622', section: '1',
    }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches validate_citation', async () => {
    const result = await handler(makeRequest('validate_citation', { citation: '§ 1 ABGB' }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches build_legal_stance', async () => {
    const result = await handler(makeRequest('build_legal_stance', { query: 'Recht' }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches format_citation', async () => {
    const result = await handler(makeRequest('format_citation', { citation: '§ 1 ABGB' }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches check_currency', async () => {
    const result = await handler(makeRequest('check_currency', { document_id: 'gesetz-10001622' }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches list_sources', async () => {
    const result = await handler(makeRequest('list_sources'));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches get_eu_basis', async () => {
    const result = await handler(makeRequest('get_eu_basis', { document_id: 'gesetz-10001622' }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches get_austrian_implementations', async () => {
    const result = await handler(makeRequest('get_austrian_implementations', {
      eu_document_id: 'directive:2016/1148',
    }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches search_eu_implementations', async () => {
    const result = await handler(makeRequest('search_eu_implementations', {}));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches get_provision_eu_basis', async () => {
    const result = await handler(makeRequest('get_provision_eu_basis', {
      document_id: 'gesetz-10001622', provision_ref: '1',
    }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches validate_eu_compliance', async () => {
    const result = await handler(makeRequest('validate_eu_compliance', {
      document_id: 'gesetz-10001622',
    }));
    expect(result.isError).toBeUndefined();
  });

  it('dispatches about', async () => {
    const result = await handler(makeRequest('about'));
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.server.name).toBe('Austrian Law MCP');
  });

  it('returns isError for unknown tool', async () => {
    const result = await handler(makeRequest('nonexistent_tool'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('returns isError when tool throws', async () => {
    const result = await handler(makeRequest('get_eu_basis', { document_id: '' }));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('document_id is required');
  });
});

describe('Registry dispatch — about without context', () => {
  it('returns isError when about context is not configured', async () => {
    const handler = captureCallToolHandler(db, false);
    const result = await handler(makeRequest('about'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not configured');
  });
});

describe('Registry dispatch — ListTools handler', () => {
  it('returns all tools from ListTools handler', async () => {
    const handlers: HandlerFn[] = [];
    const fakeServer = {
      setRequestHandler: (_schema: any, handler: HandlerFn) => {
        handlers.push(handler);
      },
    } as unknown as Server;

    const context = makeAboutContext('data/database.db', db, SERVER_VERSION);
    registerTools(fakeServer, db, context);

    // handlers[0] = ListToolsRequestSchema handler
    const listHandler = handlers[0];
    const result = await listHandler({});
    expect(result.tools.length).toBeGreaterThan(10);
    expect(result.tools.some((t: any) => t.name === 'about')).toBe(true);
  });
});
