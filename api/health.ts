import type { VercelRequest, VercelResponse } from '@vercel/node';
import { REPOSITORY_URL, SERVER_NAME, SERVER_VERSION } from '../src/server-info.js';

const STALENESS_THRESHOLD_DAYS = 30;

export default function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);

  if (url.pathname === '/version' || url.searchParams.has('version')) {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      node_version: process.version,
      transport: ['stdio', 'streamable-http'],
      capabilities: ['statutes', 'eu_cross_references'],
      tier: 'free',
      source_schema_version: '1.0',
      repo_url: REPOSITORY_URL,
      report_issue_url: `${REPOSITORY_URL}/issues/new?template=data-error.md`,
    });
    return;
  }

  // Determine health status — cold starts are noted but not degraded
  const uptimeSeconds = Math.floor(process.uptime());
  const status: 'ok' | 'degraded' | 'error' = 'ok';
  const statusReason = uptimeSeconds < 5
    ? 'Cold start — first request after spin-up'
    : undefined;

  res.status(200).json({
    status,
    ...(statusReason && { status_reason: statusReason }),
    server: SERVER_NAME,
    version: SERVER_VERSION,
    uptime_seconds: uptimeSeconds,
    data_freshness: {
      max_age_days: STALENESS_THRESHOLD_DAYS,
      note: 'Serving bundled free-tier database',
    },
    capabilities: ['statutes', 'eu_cross_references'],
    tier: 'free',
  });
}
