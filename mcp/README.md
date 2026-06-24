# Reqon MCP server

Exposes your running Reqon board to MCP clients (ChatGPT desktop, Claude, etc.) as **read-only**
tools, so an assistant can answer questions about your pipeline directly.

## Tools
- `list_reqs(status?, tier?, limit?)` — roles ranked by expected value (fit × prob)
- `get_req(company, role)` — full record for one role
- `pipeline_stats()` — tier mix, status buckets, applied-this-week, avg EV, top opportunities

It calls the board over HTTP (`/api/reqs`) — it never reads `data.json` directly — so it respects
the same data and auth as the board.

## Setup
```bash
cd mcp
npm install            # installs @modelcontextprotocol/sdk
```

## Run
```bash
REQON_ORIGIN=http://localhost:8787 REQON_TOKEN=your-passphrase node server.js
```
- `REQON_ORIGIN` — board URL (default `http://localhost:8787`)
- `REQON_TOKEN` — only needed if the board has `APP_TOKEN` set

## Register in an MCP client
Point the client at the command (stdio transport). Example config shape:
```json
{
  "mcpServers": {
    "reqon": {
      "command": "node",
      "args": ["/Users/plex/Documents/reqon/mcp/server.js"],
      "env": { "REQON_ORIGIN": "http://localhost:8787" }
    }
  }
}
```

Read-only by design: it never writes to the board. To change data, use the board, app, or extension.
