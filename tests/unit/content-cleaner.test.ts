import { describe, expect, it } from 'vitest';
import { cleanProvisionContent } from '../../src/utils/content-cleaner.js';

describe('Content cleaner', () => {
  it('strips RIS metadata from B-VG Art. 1', () => {
    const raw = [
      'BGBl. Nr. 1/1930 zuletzt geändert durch StGBl. Nr. 4/1945',
      'BVG',
      'Art. 1',
      '19.12.1945',
      '31.12.1994',
      'B-VG',
      '10/01 Bundes-Verfassungsgesetz (B-VG)',
      'Österreich ist eine demokratische Republik. Ihr Recht geht vom Volk aus. Artikel 1.',
      'Staatsform, Regierungsform, Demokratie, demokratisches Prinzip,',
      'republikanisches Prinzip, Grundprinzip, Baugesetz, Gesamtänderung',
      '10.01.2020',
      '10000138',
      'NOR12002675',
      'N1193018808R',
    ].join('\n');

    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toBe('Österreich ist eine demokratische Republik. Ihr Recht geht vom Volk aus.');
  });

  it('strips RIS metadata from ABGB § 1', () => {
    const raw = [
      'JGS Nr. 946/1811',
      '§ 1',
      '01.01.1812',
      'Der Inbegriff der Gesetze, wodurch die Privat-Rechte und Pflichten der Einwohner des Staates unter sich bestimmt werden, macht das bürgerliche Recht in demselben aus. § 1.',
    ].join('\n');

    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toBe(
      'Der Inbegriff der Gesetze, wodurch die Privat-Rechte und Pflichten der Einwohner des Staates unter sich bestimmt werden, macht das bürgerliche Recht in demselben aus.'
    );
  });

  it('strips RIS metadata from ASVG § 1', () => {
    const raw = [
      'BGBl. Nr. 189/1955',
      'BG',
      '§ 1',
      '01.01.1956',
      'ASVG',
      '66/01 Allgemeines Sozialversicherungsgesetz',
      'Dieses Bundesgesetz regelt die Allgemeine Sozialversicherung im Inland beschäftigter Personen. § 1.',
      '18.12.2024',
      '10008147',
      'NOR12093434',
      'N6195545424L',
    ].join('\n');

    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toBe(
      'Dieses Bundesgesetz regelt die Allgemeine Sozialversicherung im Inland beschäftigter Personen.'
    );
  });

  it('preserves multi-paragraph content', () => {
    const raw = [
      'BGBl. Nr. 194/1961 zuletzt geändert durch BGBl. I Nr. 104/2019',
      'BG',
      '§ 1',
      '01.01.2021',
      'BAO',
      '32/01 Finanzverfahren, allgemeines Abgabenrecht',
      '(1) Die Bestimmungen dieses Bundesgesetzes gelten in Angelegenheiten der öffentlichen Abgaben.',
      '(2) Die Bestimmungen gelten überdies in Angelegenheiten der Beiträge.',
    ].join('\n');

    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toContain('(1)');
    expect(cleaned).toContain('(2)');
    expect(cleaned).not.toContain('BGBl');
    expect(cleaned).not.toContain('BAO');
  });

  it('handles content with no metadata gracefully', () => {
    const raw = 'This is plain content with no metadata.';
    expect(cleanProvisionContent(raw)).toBe(raw);
  });

  it('handles empty content', () => {
    expect(cleanProvisionContent('')).toBe('');
  });

  it('strips BGBl. II and BGBl. III references', () => {
    const raw = [
      'BGBl. III Nr. 188/1997',
      'Anl. 1',
      '01.11.1997',
    ].join('\n');
    expect(cleanProvisionContent(raw)).toBe('');
  });

  it('preserves comma-separated content with terms > 40 chars (not keywords)', () => {
    // This line matches KEYWORD_LINE_PATTERN but has a term > 40 chars,
    // so isKeywordLine returns false and the line is preserved as content.
    const longTermLine = 'Befugnisse des Bundesministers für Inneres und Föderales, Sicherheitspolitik, Verteidigung';
    const raw = [
      'BGBl. Nr. 1/2000',
      '§ 1',
      '01.01.2000',
      longTermLine,
    ].join('\n');
    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toContain('Befugnisse');
  });

  it('strips short keyword lines at end of content', () => {
    const raw = [
      'BGBl. Nr. 1/2000',
      '§ 1',
      '01.01.2000',
      'Dieses Gesetz regelt die Verwaltung.',
      'Verwaltung, Organisation, Behörde',
    ].join('\n');
    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toBe('Dieses Gesetz regelt die Verwaltung.');
  });

  it('preserves German special characters (ß, ü, ö, ä)', () => {
    const raw = [
      'BGBl. Nr. 1/2000',
      '§ 1',
      '01.01.2000',
      'Straßenverkehrsordnung: Überholen auf Brücken ist verboten.',
    ].join('\n');

    const cleaned = cleanProvisionContent(raw);
    expect(cleaned).toContain('Straßenverkehrsordnung');
    expect(cleaned).toContain('Überholen');
  });
});
