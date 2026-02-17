import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

import { parseCitation } from '../../src/citation/parser.js';
import { formatCitation } from '../../src/citation/formatter.js';
import { validateCitation } from '../../src/citation/validator.js';

let db: InstanceType<typeof Database>;

describe('Austrian citation handling', () => {
  beforeAll(() => {
    db = new Database('data/database.db', { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  it('parses Austrian section-first citation', () => {
    const parsed = parseCitation('§ 1, Allgemeines bürgerliches Gesetzbuch');
    expect(parsed.valid).toBe(true);
    expect(parsed.section).toBe('1');
    expect(parsed.title).toBe('Allgemeines bürgerliches Gesetzbuch');
  });

  it('parses Austrian title-first citation', () => {
    const parsed = parseCitation('Allgemeines bürgerliches Gesetzbuch § 1');
    expect(parsed.valid).toBe(true);
    expect(parsed.section).toBe('1');
    expect(parsed.title).toBe('Allgemeines bürgerliches Gesetzbuch');
  });

  it('formats parsed citation with Austrian section symbol', () => {
    const parsed = parseCitation('§ 1, Allgemeines bürgerliches Gesetzbuch');
    const formatted = formatCitation(parsed, 'short');
    expect(formatted.startsWith('§ 1')).toBe(true);
  });

  it('formats full citation with comma separator before title', () => {
    const parsed = parseCitation('§ 1, Allgemeines bürgerliches Gesetzbuch');
    const formatted = formatCitation(parsed, 'full');
    expect(formatted).toBe('§ 1, Allgemeines bürgerliches Gesetzbuch');
  });

  it('validates a known ABGB citation against database content', () => {
    const result = validateCitation(db, '§ 1, Allgemeines bürgerliches Gesetzbuch');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('validates statute-id citation against database content', () => {
    const result = validateCitation(db, 'gesetz-10001622 § 1');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(true);
  });
});
