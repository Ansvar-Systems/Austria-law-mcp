/**
 * Normalize flexible provision references for SQL lookups.
 *
 * Accepts forms such as:
 * - "1"
 * - "§ 1" / "§1"
 * - "para1"
 */

export interface ProvisionLookupCandidates {
  provisionRefs: string[];
  sections: string[];
  canonicalSection: string;
}

export function buildProvisionLookupCandidates(input: string): ProvisionLookupCandidates {
  const raw = input.trim();
  if (!raw) {
    return { provisionRefs: [], sections: [], canonicalSection: '' };
  }

  const withoutParagraphSymbol = raw.replace(/^§\s*/i, '').trim();
  const withoutParaPrefix = withoutParagraphSymbol.replace(/^para/i, '').trim();
  const canonicalSection = withoutParaPrefix.replace(/\s+/g, '');
  const canonicalSectionWithSymbol = `§ ${canonicalSection}`;

  const provisionRefSet = new Set<string>([
    raw,
    withoutParagraphSymbol,
    withoutParaPrefix,
    canonicalSection,
    `para${canonicalSection.toLowerCase()}`,
  ]);

  const sectionSet = new Set<string>([
    raw,
    withoutParagraphSymbol,
    withoutParaPrefix,
    canonicalSection,
    `§${canonicalSection}`,
    canonicalSectionWithSymbol,
  ]);

  return {
    provisionRefs: [...provisionRefSet].filter(Boolean),
    sections: [...sectionSet].filter(Boolean),
    canonicalSection,
  };
}
