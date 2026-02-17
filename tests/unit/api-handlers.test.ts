import { describe, expect, it } from 'vitest';

import healthHandler from '../../api/health.ts';
import mcpHandler from '../../api/mcp.ts';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  headersSent: boolean;
  status(code: number): MockResponse;
  json(payload: unknown): MockResponse;
  setHeader(name: string, value: string): void;
  end(): MockResponse;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
}

describe('Vercel API handlers', () => {
  it('returns version payload from /version health route', () => {
    const req = { url: '/version', headers: { host: 'localhost' } };
    const res = createMockResponse();

    healthHandler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.version).toBeDefined();
    expect(body.transport).toEqual(['stdio', 'streamable-http']);
  });

  it('responds to MCP GET metadata request', async () => {
    const req = { method: 'GET', url: '/api/mcp', headers: { host: 'localhost' } };
    const res = createMockResponse();

    await mcpHandler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.protocol).toBe('mcp-streamable-http');
  });

  it('responds to MCP OPTIONS preflight request', async () => {
    const req = { method: 'OPTIONS', url: '/api/mcp', headers: { host: 'localhost' } };
    const res = createMockResponse();

    await mcpHandler(req as never, res as never);

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
