import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { join } from 'path';
import { copyFileSync, existsSync, rmSync, statSync } from 'fs';

import { registerTools, type AboutContext } from '../src/tools/registry.js';
import { makeAboutContext } from '../src/utils/about-context.js';
import {
  DB_ENV_VAR,
  SERVER_NAME,
  SERVER_VERSION,
} from '../src/server-info.js';

const SOURCE_DB = process.env[DB_ENV_VAR]
  || join(process.cwd(), 'data', 'database.db');
const TMP_DB = `/tmp/${SERVER_NAME}.db`;
const TMP_DB_LOCK = `${TMP_DB}.lock`;

let db: InstanceType<typeof Database> | null = null;
let aboutContext: AboutContext | undefined;
let sourceDbSignature = '';

function computeSignature(path: string): string {
  const stat = statSync(path);
  return `${stat.size}:${stat.mtimeMs}`;
}

function ensureTmpDatabaseCurrent(): void {
  const latestSignature = computeSignature(SOURCE_DB);
  const shouldRefresh = !existsSync(TMP_DB) || sourceDbSignature !== latestSignature;

  if (!shouldRefresh) {
    return;
  }

  if (db) {
    db.close();
    db = null;
  }

  aboutContext = undefined;
  sourceDbSignature = latestSignature;

  if (existsSync(TMP_DB_LOCK)) {
    rmSync(TMP_DB_LOCK, { recursive: true, force: true });
  }

  rmSync(TMP_DB, { force: true });
  copyFileSync(SOURCE_DB, TMP_DB);
}

function getDatabase(): InstanceType<typeof Database> {
  ensureTmpDatabaseCurrent();

  if (db) {
    return db;
  }

  db = new Database(TMP_DB, { readonly: true });
  db.pragma('foreign_keys = ON');
  return db;
}

function getAboutContext(database: InstanceType<typeof Database>): AboutContext {
  if (!aboutContext) {
    aboutContext = makeAboutContext(TMP_DB, database, SERVER_VERSION);
  }
  return aboutContext;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: 'mcp-streamable-http',
    });
    return;
  }

  try {
    if (!existsSync(SOURCE_DB)) {
      res.status(500).json({ error: `Database not found at ${SOURCE_DB}` });
      return;
    }

    const database = getDatabase();

    const server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    registerTools(server, database, getAboutContext(database));

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP handler error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
