# Austrian Law MCP Server

**The RIS (Rechtsinformationssystem) alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Faustrian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/austrian-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Austria-law-mcp?style=social)](https://github.com/Ansvar-Systems/Austria-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Austria-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Austria-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Austria-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Austria-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-56%2C760-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **5,101 Austrian statutes** -- from Datenschutzgesetz and Strafgesetzbuch to Allgemeines bürgerliches Gesetzbuch, Arbeitsverfassungsgesetz, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Austrian legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Austrian legal research means navigating the RIS (Rechtsinformationssystem des Bundes), juggling Bundesgesetze, Landesgesetze, and RIS-Suchabfragen. Whether you're:

- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking DSGVO obligations or Arbeitsverfassungsgesetz requirements
- A **legal tech developer** building tools on Austrian law
- A **researcher** tracing legislative history from Regierungsvorlage to enacted statute

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Austrian law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://austrian-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add austrian-law --transport http https://austrian-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "austrian-law": {
      "type": "url",
      "url": "https://austrian-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "austrian-law": {
      "type": "http",
      "url": "https://austrian-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/austrian-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "austrian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/austrian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "austrian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/austrian-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally -- in German or English:

- *"Was sagt das Datenschutzgesetz (DSG 2018) § 4 über Einwilligung?"*
- *"Ist das Arbeitsverfassungsgesetz (ArbVG) noch in Kraft?"*
- *"Suche nach Bestimmungen über Datenschutz im österreichischen Recht"*
- *"Welche EU-Richtlinien setzt das DSG 2018 um?"*
- *"Finde die Strafbestimmungen im Strafgesetzbuch (StGB) zu Computerbetrug"*
- *"Was regelt das ABGB (Allgemeines bürgerliches Gesetzbuch) über Vertragsabschluss?"*
- *"Suche nach Arbeitnehmerschutzvorschriften im ArbVG"*
- *"Which Austrian laws implement the GDPR?"*
- *"Compare NIS2 implementation requirements across Austrian statutes"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 5,101 statutes | Comprehensive Austrian federal legislation |
| **Provisions** | 56,760 sections | Full-text searchable with FTS5 |
| **Preparatory Works** | 2,674 documents | Regierungsvorlagen and parliamentary materials (Premium) |
| **Case Law** | 230,201 decisions | OGH, VfGH, VwGH (Premium tier) |
| **Database Size** | ~1.5 GB | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against RIS |

**Verified data only** -- every citation is validated against official sources (ris.bka.gv.at). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from RIS (Rechtsinformationssystem des Bundes) official sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by BGBl number + paragraph/section
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
RIS OGD API → Parse → SQLite → FTS5 snippet() → MCP response
                ↑                      ↑
         Provision parser       Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search RIS by Gesetzestitel | Search by plain German: *"Datenschutz Einwilligung"* |
| Navigate multi-paragraph statutes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Ist dieses Gesetz noch in Kraft?" → manual check | `check_currency` tool → answer in seconds |
| Find EU basis → dig through EUR-Lex | `get_eu_basis` → linked EU directives instantly |
| Check RIS for updates | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Search RIS → Download PDF → Ctrl+F → Cross-reference with Regierungsvorlage → Check EUR-Lex → Repeat

**This MCP:** *"Welche EU-Richtlinie liegt dem DSG 2018 § 4 zur Einwilligung zugrunde?"* → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on 56,760 provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by BGBl number + paragraph/section |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes, case law, preparatory works |
| `format_citation` | Format citations per Austrian conventions (full/short/pinpoint) |
| `check_currency` | Check if statute is in force, amended, or repealed |
| `list_sources` | List all available statutes with metadata and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations for Austrian statute |
| `get_austrian_implementations` | Find Austrian laws implementing EU act |
| `search_eu_implementations` | Search EU documents with Austrian implementation counts |
| `get_provision_eu_basis` | Get EU law references for specific provision |
| `validate_eu_compliance` | Check implementation status (requires EU MCP) |

---

## EU Law Integration

Austria is an EU member state. Austrian law is heavily shaped by EU directives and regulations, particularly in data protection, financial services, consumer protection, and environmental law.

| Metric | Value |
|--------|-------|
| **EU Member Since** | 1995 |
| **GDPR Implementation** | DSG 2018 (Datenschutzgesetz) |
| **NIS2 Implementation** | NISG 2024 (Netz- und Informationssystemsicherheitsgesetz) |
| **Authority** | Datenschutzbehörde (DSB) |
| **EUR-Lex Integration** | Automated metadata fetching |

### Key Austrian EU Implementations

- **GDPR** (2016/679) → Datenschutzgesetz 2018 (DSG 2018)
- **NIS2 Directive** (2022/2555) → NISG 2024
- **AI Act** (2024/1689) → Austrian implementation in progress
- **eIDAS** (910/2014) → E-Government-Gesetz, Signaturgesetz
- **AML Directive** (2015/849) → Finanzmarkt-Geldwäschegesetz (FM-GwG)
- **Consumer Rights Directive** (2011/83) → Konsumentenschutzgesetz (KSchG)

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation.

---

## Data Sources & Freshness

All content is sourced from authoritative Austrian legal databases:

- **[RIS - Rechtsinformationssystem des Bundes](https://www.ris.bka.gv.at/)** -- Official federal law database, Bundeskanzleramt
- **[EUR-Lex](https://eur-lex.europa.eu/)** -- Official EU law database (metadata only)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Bundeskanzleramt Österreich |
| **Retrieval method** | RIS OGD API |
| **Language** | German |
| **License** | RIS data (public domain, Austria) |
| **Coverage** | 5,101 federal statutes |
| **Last ingested** | 2026-02-25 |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors all data sources:

| Source | Check | Method |
|--------|-------|--------|
| **Statute amendments** | RIS API date comparison | All 5,101 statutes checked |
| **New statutes** | RIS Bundesgesetzblatt feed | Diffed against database |
| **EU reference staleness** | Git commit timestamps | Flagged if >90 days old |

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official RIS publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage** is available in Premium tier only -- do not rely solely on this for case law research in the free tier
> - **Verify critical citations** against primary sources (ris.bka.gv.at) for court filings
> - **EU cross-references** are extracted from Austrian statute text, not EUR-Lex full text

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for Österreichischer Rechtsanwaltskammertag (ÖRAK) compliance guidance.

---

## Documentation

- **[EU Integration Guide](docs/EU_INTEGRATION_GUIDE.md)** -- Detailed EU cross-reference documentation
- **[EU Usage Examples](docs/EU_USAGE_EXAMPLES.md)** -- Practical EU lookup examples
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Austria-law-mcp
cd Austria-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                     # Ingest statutes from RIS
npm run build:db                   # Rebuild SQLite database
npm run drift:detect               # Run drift detection
npm run check-updates              # Check for amendments and new statutes
npm run db:update-seed             # Update database from seed data
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~1.5 GB (comprehensive corpus)
- **Reliability:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/austrian-law-mcp (This Project)
**Query 5,101 Austrian statutes directly from Claude** -- DSG 2018, StGB, ABGB, ArbVG, and more. Full provision text with EU cross-references. `npx @ansvar/austrian-law-mcp`

### [@ansvar/german-law-mcp](https://github.com/Ansvar-Systems/german-law-mcp)
**Query German federal statutes** -- BDSG, StGB, BGB, and more. `npx @ansvar/german-law-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

### [@ansvar/sanctions-mcp](https://github.com/Ansvar-Systems/Sanctions-MCP)
**Offline-capable sanctions screening** -- OFAC, EU, UN sanctions lists. `pip install ansvar-sanctions-mcp`

**70+ national law MCPs** covering Belgium, Denmark, Finland, France, Germany, Ireland, Italy, Netherlands, Norway, Poland, Portugal, Slovenia, Spain, Sweden, Switzerland, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- EU regulation cross-reference expansion
- Historical statute versions and amendment tracking
- English translations for key statutes
- Lower court decision coverage

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Full corpus ingestion (5,101 statutes, 56,760 provisions)
- [x] EU law integration tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [x] Daily freshness checks against RIS
- [ ] Court case law expansion (Premium tier)
- [ ] Historical statute versions (amendment tracking)
- [ ] English translations for key statutes
- [ ] Landesrecht coverage (provincial law)

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{austrian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Austrian Law MCP Server: Production-Grade Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Austria-law-mcp},
  note = {5,101 Austrian statutes with 56,760 provisions and EU law cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Bundeskanzleramt Österreich (public domain, RIS OGD)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server started as our internal reference tool for Austrian law -- turns out everyone building for the DACH market has the same research frustrations.

So we're open-sourcing it. Navigating 5,101 statutes in the RIS shouldn't require a Rechtswissenschaftsstudium.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
