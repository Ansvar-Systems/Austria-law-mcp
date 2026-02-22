# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Austrian bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Austrian bar rules (ÖRAK — Österreichischer Rechtsanwaltskammertag) require strict confidentiality (Verschwiegenheitspflicht) and data processing controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/austrian-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/austrian-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://austrian-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text (Gesetzestexte), provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Austria)

### Austrian Bar Association Rules

Austrian lawyers (Rechtsanwältinnen und Rechtsanwälte) are bound by strict confidentiality rules under the Rechtsanwaltsordnung (RAO) and the Berufsordnung of the ÖRAK and regional Rechtsanwaltskammern.

#### Verschwiegenheitspflicht (Duty of Confidentiality)

- All client communications are privileged under § 9 RAO
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of confidentiality may result in disciplinary proceedings (Disziplinarverfahren)

### Austrian Data Protection Act (DSG) and GDPR

Under **GDPR Article 28** and the **Datenschutzgesetz (DSG)**, when using services that process client data:

- You are the **Data Controller** (Verantwortlicher)
- AI service providers (Anthropic, Vercel) may be **Data Processors** (Auftragsverarbeiter)
- A **Data Processing Agreement (Auftragsverarbeitungsvertrag, AVV)** may be required
- Ensure adequate technical and organizational measures (technische und organisatorische Maßnahmen, TOMs)
- The Austrian Data Protection Authority (Datenschutzbehörde, dsb.gv.at) oversees compliance

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does § 1295 ABGB say about liability for damages?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for embezzlement under Austrian criminal law (StGB)?"
```

- Query pattern may reveal you are working on an embezzlement matter
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases (RDB, LexisNexis Austria) with proper data processing agreements

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms (Einzelanwälte / Kleine Kanzleien)

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use commercial legal databases (RDB, LexisNexis Austria, Manz Onlinebibliothek)

### For Large Firms / Corporate Legal (Großkanzleien / Rechtsabteilungen)

1. Negotiate Data Processing Agreements (AVV) with AI service providers
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns

### For Government / Public Sector (Behörden / Öffentlicher Sektor)

1. Use self-hosted deployment, no external APIs
2. Follow Austrian government IT security requirements (IKT-Sicherheit des Bundes)
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Austrian-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **ÖRAK Guidance**: Consult ÖRAK or your regional Rechtsanwaltskammer ethics guidance

---

**Last Updated**: 2026-02-22
**Tool Version**: 1.0.0
