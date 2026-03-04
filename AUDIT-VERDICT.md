# Austrian Law MCP Server — Production Audit Verdict

**Audit Date:** 2026-02-18
**Server:** `@ansvar/austrian-law-mcp` v1.0.0
**Auditor:** Claude (automated + manual sampling)
**Audit Document:** `mcp-production-audit.md` v1.0

---

## Scores

| Category | Score | Description |
|----------|-------|-------------|
| **Agent-Readiness** | 95/100 | All 13 tools have clear names, descriptions with edge cases, and complete Zod schemas. Standard tool set (10 required + 4 advanced) fully implemented. Both stdio and HTTP transports verified identical. Minor deduction: EU tools return empty results (tables not yet populated). |
| **Data Accuracy** | 88/100 | Zero text discrepancies found in sampled provisions (B-VG Art. 1, ABGB § 1, ASVG § 1 all character-perfect against RIS). FTS search accurate. Negative tests pass. Deduction: free tier covers ~5K of ~17K+ federal laws; major statutes (StGB, DSG, GewO) missing from seed data. EU tables empty. |
| **Optimization** | 93/100 | FTS5 MATCH used correctly everywhere (no LIKE for full-text). No N+1 queries. Content cleaning pipeline handles BGBl refs, HTML entities. FTS5 injection and SQL LIKE injection both prevented. Missing indexes added for legal_documents.title, eu_documents.short_name, eu_documents.celex_number. Journal mode DELETE (correct for serverless). |
| **Deployment Maturity** | 96/100 | All 6 security scanning layers configured. Golden tests (13) with accuracy validation. Drift detection via SHA256 hashes. Daily freshness checks. npm audit: 0 vulnerabilities. server.json published. CHANGELOG.md created. Health endpoint returns structured JSON. Minor: Gitleaks doesn't emit SARIF. |
| **Overall Grade** | **A** | |

---

## Critical Findings

None. No production blockers identified.

---

## Data Discrepancies Found

**Zero text-level discrepancies** in sampled provisions:

| Provision | Source | Result |
|-----------|--------|--------|
| B-VG Art. 1 | RIS OGD API | PERFECT MATCH |
| ABGB § 1 | RIS OGD API | PERFECT MATCH |
| ASVG § 1 | RIS OGD API | PERFECT MATCH (after content cleaning) |
| FTS "demokratische Republik" | DB search | Correct result returned |
| Negative: "Fantasiegesetz" | DB search | 0 results (correct) |
| Edge: "Übergang" (umlaut) | FTS search | Correct results returned |

**Coverage gaps** (not data errors — free tier limitation):
- 5,099 documents in DB vs. ~17K+ in full RIS corpus
- StGB, DSG, GewO, BAO, ZPO, UrhG not in free tier seed
- EU tables structurally present but empty (0 eu_documents, 0 eu_references)
- Referential integrity: PERFECT (0 orphan provisions, 0 FTS mismatches)

---

## Top 10 Improvements (prioritized by impact)

1. **Expand seed data to include major statutes** — StGB (Criminal Code), DSG (Data Protection), GewO (Trade Regulation) are frequently referenced in compliance contexts. *Impact: High. Files: `scripts/fetch-ris.ts`, `data/seed/`*

2. **Populate EU cross-reference tables** — The `eu_documents` and `eu_references` tables exist but are empty. Three tools (`get-eu-basis`, `get-national-eu-implementations`, `search-eu-implementations`) return empty results. *Impact: High. Files: `scripts/fetch-eu.ts` (new), `scripts/build-db.ts`*

3. **Add SARIF output to Gitleaks** — 5/6 security layers upload SARIF to GitHub Security tab; Gitleaks is the exception. *Impact: Low. File: `.github/workflows/security.yml:90-104`*

4. **Add `section` index for direct provision lookups** — `legal_provisions.section` is queried directly but has no standalone index. *Impact: Medium. File: `scripts/build-db.ts`*

5. **Add temporal validity filtering** — `valid_from`/`valid_to` columns exist but no tool exposes date-range filtering. *Impact: Medium. Files: `src/tools/get-provision.ts`, `src/tools/search-legislation.ts`*

6. **Automated seed data expansion pipeline** — Current `fetch-ris.ts` supports incremental fetching; a scheduled workflow could expand coverage over time. *Impact: Medium. File: `.github/workflows/expand-coverage.yml` (new)*

7. **Add EU document ingestion from EUR-Lex** — EUR-Lex provides structured data for directives/regulations. Would populate the empty EU tables. *Impact: Medium. Files: `scripts/fetch-eu.ts` (new)*

8. **Add provision count to search results** — `search-legislation` returns documents but doesn't indicate how many provisions matched. *Impact: Low. File: `src/tools/search-legislation.ts`*

9. **Add multi-law comparison tool** — Agents frequently need to compare provisions across laws (e.g., DSG vs. GDPR). *Impact: Low. Future feature.*

10. **Add pagination metadata to list tools** — Currently returns `has_more` boolean; could include total count for agent planning. *Impact: Low. File: `src/tools/search-legislation.ts`*

---

## Risk Assessment

**What could go wrong if an agent relies on this server in production?**

| Risk | Severity | Mitigation |
|------|----------|------------|
| Agent cites a law not in the free tier (e.g., StGB § 75) | **Medium** | Tools return clear "not found" errors; agent should communicate coverage limitations. `list-sources` tool documents the tier and scope. |
| EU cross-reference tools return empty results | **Medium** | Tools return structured empty arrays (not errors). Agent must interpret absence correctly. Tool descriptions note this limitation. |
| Provision text becomes stale after RIS update | **Low** | Daily `check-updates.yml` monitors anchor statutes. `drift-detect.yml` hashes upstream pages. GitHub issues auto-created on drift. `check-currency` tool exposes staleness metadata to agents. |
| Content cleaning removes meaningful text | **Very Low** | Cleaner only strips BGBl citation suffixes and normalizes whitespace. Sampled provisions match RIS character-for-character after cleaning. |
| SQL injection via tool parameters | **Very Low** | All queries use parameterized statements. FTS5 input is double-quote escaped. LIKE wildcards are backslash-escaped. Zod validates all inputs. |

---

## Server-Specific Notes

### Austrian Jurisdiction
- **Authoritative source**: RIS OGD API v2.6 (Bundeskanzleramt), CC BY 4.0 license
- **Language**: German only (no English translations of provision text)
- **Citation format**: Austrian standard (§ X, Gesetzestitel) — parser handles both German and legacy English formats
- **Temporal validity**: Provisions have `valid_from`/`valid_to` but no date-filtering tool yet

### Deployment Strategy
- **Vercel Serverless**: Database copied to `/tmp` on cold start with signature-based caching
- **Journal mode**: DELETE (correct for serverless — WAL requires persistent filesystem)
- **Database size**: ~125 MB (fits within Vercel limits)

### Test Coverage
- 269 tests, 100% statements, 99.07% branches, 100% functions, 100% lines
- 13 golden contract tests with `json_path_equals` accuracy validation
- 3 anchor provision hashes for drift detection

---

## Grading Justification

**Grade: A** (not A+)

Per the rubric, A+ requires "zero data discrepancies, all 6 security layers, golden tests, MCP registry published, dual-channel working." This server meets all criteria except:

- **Coverage gap**: While there are zero *text-level* discrepancies, the free tier's ~5K document coverage (vs. ~17K+ in RIS) and empty EU tables represent a meaningful completeness gap. An agent asking about StGB or DSG would get "not found" — factually correct but operationally limiting.

The grade of **A** reflects: zero data discrepancies in sampled content, minor operational gaps (EU tables empty, Gitleaks SARIF missing), excellent test coverage, and robust security posture.

---

*Generated by production audit workflow per `mcp-production-audit.md` v1.0*
