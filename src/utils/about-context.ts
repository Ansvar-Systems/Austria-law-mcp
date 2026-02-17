import { createHash } from 'crypto';
import { statSync } from 'fs';

import type Database from '@ansvar/mcp-sqlite';
import type { AboutContext } from '../tools/about.js';

function readBuiltAt(db: InstanceType<typeof Database>): string {
  try {
    const row = db
      .prepare("SELECT value FROM db_metadata WHERE key = 'built_at'")
      .get() as { value: string } | undefined;
    return row?.value ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function fingerprintFromStat(dbPath: string): string {
  try {
    const stat = statSync(dbPath);
    return createHash('sha256')
      .update(`${dbPath}:${stat.size}:${stat.mtimeMs}`)
      .digest('hex')
      .slice(0, 12);
  } catch {
    return 'unknown';
  }
}

export function makeAboutContext(
  dbPath: string,
  db: InstanceType<typeof Database>,
  version: string,
): AboutContext {
  return {
    version,
    fingerprint: fingerprintFromStat(dbPath),
    dbBuilt: readBuiltAt(db),
  };
}
