#!/usr/bin/env node

/**
 * Austrian Law MCP Server — stdio entry point.
 *
 * Provides Austrian legislation search via Model Context Protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from '@ansvar/mcp-sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { registerTools, type AboutContext } from './tools/registry.js';
import { detectCapabilities, readDbMetadata } from './capabilities.js';
import {
  DB_ENV_VAR,
  SERVER_NAME,
  SERVER_VERSION,
} from './server-info.js';
import { makeAboutContext } from './utils/about-context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  if (process.env[DB_ENV_VAR]) {
    return process.env[DB_ENV_VAR];
  }
  // Check for database relative to the package
  return join(__dirname, '..', 'data', 'database.db');
}

let db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!db) {
    const dbPath = resolveDbPath();
    db = new Database(dbPath, { readonly: true });
    db.pragma('foreign_keys = ON');

    const caps = detectCapabilities(db);
    const meta = readDbMetadata(db);
    console.error(`[${SERVER_NAME}] DB opened: tier=${meta.tier}, caps=[${[...caps].join(',')}]`);
  }
  return db;
}

function computeAboutContext(): AboutContext {
  const dbPath = resolveDbPath();
  return makeAboutContext(dbPath, getDb(), SERVER_VERSION);
}

async function main() {
  const database = getDb();
  const aboutContext = computeAboutContext();

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  registerTools(server, database, aboutContext);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server running on stdio`);

  const cleanup = () => {
    if (db) {
      db.close();
      db = null;
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, err);
  process.exit(1);
});
