# Changelog

All notable changes to the Austrian Law MCP Server will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-02-18

### Added
- 13 MCP tools for Austrian federal legislation (search, retrieval, citation, compliance)
- SQLite database with 5,099 federal documents and 54,727 provisions from RIS OGD API
- FTS5 full-text search with unicode61 tokenizer
- Austrian legal citation parser, validator, and formatter
- Dual-channel transport: stdio (npm) and Streamable HTTP (Vercel)
- Golden contract tests (`fixtures/golden-tests.json`) with data accuracy validation
- Drift detection via SHA256 anchor hashes (`fixtures/golden-hashes.json`)
- Automated freshness checks against RIS (`check-updates.yml`, daily)
- 6-layer security scanning (CodeQL, Semgrep, Trivy, Gitleaks, Socket, OSSF Scorecard)
- Data provenance documentation (`sources.yml`)
- Health and version endpoints for Vercel deployment
- Content cleaning pipeline (BGBl references, HTML entities, whitespace normalization)
- Provision deduplication in build pipeline

### Security
- FTS5 injection prevention (double-quote escaping)
- SQL LIKE wildcard injection prevention (backslash escaping)
- Input validation on all tool parameters (Zod schemas)
- Request timeout and retry logic for RIS API fetcher
- 0 npm audit vulnerabilities

### Known Limitations
- Free tier: ~5K documents (subset of full RIS corpus)
- EU cross-reference tables are structurally present but not yet populated
- Some federal laws (StGB, DSG, GewO, BAO, ZPO, UrhG) not yet in free tier seed data
