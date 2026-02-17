# Austrian Law MCP Server

Production-oriented MCP server for Austrian federal legislation based on RIS OGD source data.

## What This Server Provides

- Full-text provision search over a local SQLite database (FTS5).
- Provision retrieval by statute + section/provision reference.
- Citation validation and formatting for Austrian citation patterns.
- EU cross-reference lookup (Austrian law <-> EU directives/regulations).
- Streamable HTTP transport for hosted usage and stdio transport for local usage.

## Quick Start

### Run Locally (stdio MCP)

```bash
npm install
npm run build
npx @ansvar/austrian-law-mcp
```

### Run Locally in Dev Mode

```bash
npm install
npm run dev
```

### Use Hosted Endpoint

When deployed to Vercel, connect clients to:

- `https://<your-domain>/mcp`
- Health: `https://<your-domain>/health`
- Version: `https://<your-domain>/version`

## Database and Ingestion

### Build Database from Seed Files

```bash
npm run build:db
```

### Ingest from RIS OGD

```bash
# Full ingestion (slow)
npm run ingest

# Single law refresh
npm run ingest -- --law 10001622
```

## Testing

### Standard Tests

```bash
npm test
```

### Contract/Golden Tests

```bash
npm run test:contract
```

### Coverage

```bash
npm run test:coverage
```

### Nightly Contract Mode (enables network assertions)

```bash
CONTRACT_MODE=nightly npm run test:contract
```

## Drift and Freshness Automation

### Check Upstream Freshness

```bash
npm run check-updates
```

This checks configured anchor statutes against RIS “Fassung vom” dates and exits non-zero when updates are detected.
In restricted/offline environments you can run:

```bash
npm run check-updates -- --allow-errors
```

### Drift Detection Against Anchored Upstream Pages

```bash
npm run drift:detect
```

Initialize/update expected hashes:

```bash
npm run drift:detect -- --update
```

Anchors are defined in `fixtures/golden-hashes.json`.
If outbound access is restricted, use:

```bash
npm run drift:detect -- --allow-errors
```

### Apply Refreshed Seed Files to Existing Database

```bash
# Update DB using all local seed files
npm run db:update-seed

# Update only specific laws
npm run db:update-seed -- --laws "gesetz-10001622 gesetz-10003940"
```

## Vercel Deployment

This repository includes `vercel.json` with:

- Rewrites for `/mcp`, `/health`, `/version`.
- Build command: `bash scripts/download-db.sh && npm run build`.
- Bundled database + `node-sqlite3-wasm.wasm` in function artifacts.

### Deploy

1. Import the repository in Vercel.
2. Ensure the tagged release contains `database.db.gz` for the current `package.json` version.
3. Deploy. Verify:
   - `/health` returns status JSON
   - `/version` returns version metadata
   - `/mcp` accepts MCP Streamable HTTP requests

## GitHub Actions

The repo includes:

- `CI` workflow: build, tests, contract tests, coverage.
- `Data Freshness Check`: scheduled update checks, optional auto-refresh mode.
- `Drift Detection`: scheduled upstream drift checks with issue creation on mismatch.

## Data Provenance

- Primary source: RIS OGD (`https://www.ris.bka.gv.at`).
- Source metadata: `sources.yml`.
- Server code license: Apache-2.0.

## Disclaimer

This server is a legal research tool, not legal advice. Verify critical legal conclusions against official publications.
