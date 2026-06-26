#!/usr/bin/env node
/**
 * Reqon MCP server (T3.9) — exposes your self-hosted board to MCP clients (ChatGPT desktop, Claude,
 * etc.) as read-only tools, so an assistant can answer "what's in my pipeline?" directly.
 *
 * Tools:
 *   list_reqs       — filter the pipeline by status / tier, ranked by expected value
 *   get_req         — full record for one role (by company + role)
 *   pipeline_stats  — tier mix, status buckets, applied-this-week, avg EV, top opportunities
 *
 * It talks to the running board over HTTP (never touches data.json directly), honoring auth.
 * Config via env: REQON_ORIGIN (default http://localhost:8787), REQON_TOKEN (APP_TOKEN if set).
 *
 * Setup:   cd mcp && npm install
 * Run:     REQON_ORIGIN=http://localhost:8787 node server.js     (stdio transport)
 * Register the command in your MCP client's config.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const ORIGIN = (process.env.REQON_ORIGIN || 'http://localhost:8787').replace(/\/$/, '');
const TOKEN = process.env.REQON_TOKEN || '';
const ev = (r) => Math.round(((+r.fit || 0) * (+r.prob || 0) / 10) * 10) / 10;
const isApplied = (s) => /^(Applied|Recruiter Screen|Hiring Manager|Panel|Offer)$/.test(s || '');
const isClosed = (s) => /^(Rejected|Archived)$/.test(s || '');
const key = (r) => ((r.company || '') + '|' + (r.role || '')).toLowerCase().trim();

async function getRows() {
  const headers = {};
  if (TOKEN) headers['X-CRM-Token'] = TOKEN;
  const r = await fetch(ORIGIN + '/api/reqs', { headers });
  if (!r.ok) throw new Error('board returned HTTP ' + r.status + ' (is it running at ' + ORIGIN + '?)');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter((x) => x && x.deleted !== true);
}
const slim = (r) => ({ company: r.company, role: r.role, tier: r.tier, fit: r.fit, prob: r.prob, ev: ev(r), status: r.status || 'Not Applied', link: r.link, location: r.location, salary: r.salary });

const TOOLS = [
  { name: 'list_reqs', description: 'List pipeline roles, optionally filtered by status or tier, ranked by expected value (fit×prob).',
    inputSchema: { type: 'object', properties: {
      status: { type: 'string', description: 'exact status to filter by, e.g. "Applied"' },
      tier: { type: 'string', enum: ['A', 'B', 'C'] },
      limit: { type: 'integer', description: 'max rows (default 25)' },
    } } },
  { name: 'get_req', description: 'Get the full record for one role by company + role.',
    inputSchema: { type: 'object', properties: { company: { type: 'string' }, role: { type: 'string' } }, required: ['company', 'role'] } },
  { name: 'pipeline_stats', description: 'Summary stats: tier mix, status buckets, applied this week, average EV, and top opportunities to apply.',
    inputSchema: { type: 'object', properties: {} } },
];

async function call(name, args) {
  const rows = await getRows();
  if (name === 'list_reqs') {
    let out = rows.slice();
    if (args.status) out = out.filter((r) => (r.status || 'Not Applied') === args.status);
    if (args.tier) out = out.filter((r) => (r.tier || '').toUpperCase() === args.tier);
    out.sort((a, b) => ev(b) - ev(a));
    return out.slice(0, args.limit || 25).map(slim);
  }
  if (name === 'get_req') {
    const k = ((args.company || '') + '|' + (args.role || '')).toLowerCase().trim();
    const hit = rows.find((r) => key(r) === k) || rows.find((r) => key(r).includes((args.company || '').toLowerCase()));
    return hit || { error: 'no matching role' };
  }
  if (name === 'pipeline_stats') {
    const tier = { A: 0, B: 0, C: 0 }; let applied = 0, open = 0, closed = 0, appliedWk = 0, evSum = 0;
    const now = Date.now();
    for (const r of rows) {
      const t = (r.tier || 'C').toUpperCase(); if (tier[t] != null) tier[t]++;
      if (isClosed(r.status)) closed++; else if (isApplied(r.status)) { applied++; const d = Date.parse(r.applied); if (!isNaN(d) && (now - d) / 86400000 <= 7) appliedWk++; } else open++;
      evSum += ev(r);
    }
    const top = rows.filter((r) => !isApplied(r.status) && !isClosed(r.status)).sort((a, b) => ev(b) - ev(a)).slice(0, 8).map(slim);
    return { total: rows.length, tier, open, applied, closed, appliedThisWeek: appliedWk, avgEv: rows.length ? +(evSum / rows.length).toFixed(1) : 0, topOpportunities: top };
  }
  throw new Error('unknown tool ' + name);
}

const server = new Server({ name: 'reqon', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const result = await call(req.params.name, req.params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: 'Error: ' + (e && e.message ? e.message : String(e)) }] };
  }
});

await server.connect(new StdioServerTransport());
