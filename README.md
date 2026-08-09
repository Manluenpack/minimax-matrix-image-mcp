# minimax-matrix-image-mcp

MCP server wrapping MiniMax Matrix's image synthesis API — **text-to-image** (文生图) and **image-to-image** (图生图) — as tools callable by any MCP client (Claude Desktop, Cursor, etc.).

## Tools

| Tool | Description |
|------|-------------|
| `matrix_text_to_image` | Generate an image from a text prompt (文生图) |
| `matrix_image_to_image` | Transform a reference image with a prompt (图生图); accepts an http(s) URL or a **local file path** (auto-uploaded) |
| `matrix_generate_image` | Smart generation — auto text-to-image or image-to-image based on whether `input` is provided |
| `matrix_generate_batch` | Generate multiple images in one call (up to 10 requests, executed in parallel by the backend) |
| `matrix_upload_file` | Upload a local file (image/video/audio/pdf) and return its CDN URL |

## Requirements

- Node.js >= 18 (native `fetch` required)

## Configuration

Authentication is resolved in this order:

1. `MINIMAX_TOKEN` environment variable (recommended)
2. Automatic token dump from the local `mavis` daemon (macOS; disable with `MINIMAX_DISABLE_MAVIS_DUMP=1`)

Optional env vars:

| Variable | Purpose |
|----------|---------|
| `MINIMAX_BASE_URL` | Override API base URL (default `https://agent.minimaxi.com`) |
| `MINIMAX_DISABLE_MAVIS_DUMP` | Set to `1` to only use the token from env |

> **Security**: set the token via environment variable — never hardcode it in client config.

## Install & Build

```bash
cd minimax-matrix-image-mcp
npm install
npm run build
```

## Publish to npm

```bash
npm publish
```

`npm pack --dry-run` confirms the published tarball contains only `dist/`, `README.md` and `package.json` (~11 kB). The `bin` entry (`dist/index.js` with shebang) makes it runnable via `npx` or a global install.

## Usage

### Option A — via npm / npx (published package)

No local checkout needed. Use directly in your MCP client config:

```json
{
  "mcpServers": {
    "minimax": {
      "command": "npx",
      "args": ["-y", "minimax-matrix-image-mcp"],
      "env": { "MINIMAX_TOKEN": "your-token-here" }
    }
  }
}
```

Or install globally once, then use the plain command:

```bash
npm install -g minimax-matrix-image-mcp
# MCP client config: { "command": "minimax-matrix-image-mcp", "env": { "MINIMAX_TOKEN": "..." } }
```

Verify the installed binary responds over stdio:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| MINIMAX_TOKEN="$TOKEN" minimax-matrix-image-mcp
```

### Option B — local checkout (development)

Register in your MCP client config:

```json
{
  "mcpServers": {
    "minimax": {
      "command": "node",
      "args": ["/absolute/path/to/minimax-matrix-image-mcp/dist/index.js"],
      "env": { "MINIMAX_TOKEN": "your-token-here" }
    }
  }
}
```

### Quick smoke test via stdio

```bash
# List tools
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| MINIMAX_TOKEN="$TOKEN" node dist/index.js
```

### Tool call example

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"matrix_text_to_image","arguments":{"prompt":"a cute cat on a windowsill","aspect_ratio":"1:1","resolution":"1K"}}}' \
| MINIMAX_TOKEN="$TOKEN" node dist/index.js
```

## Tool parameters

| Tool | Params | Defaults |
|------|--------|----------|
| `matrix_text_to_image` | `prompt` (required), `aspect_ratio`, `resolution` | 1:1, 2K |
| `matrix_image_to_image` | `prompt` (required), `image` (required: URL or local path), `aspect_ratio`, `resolution` | 1:1, 2K |
| `matrix_generate_image` | `prompt` (required), `input` (optional), `aspect_ratio`, `resolution` | 1:1, 2K |
| `matrix_generate_batch` | `items` (required, 1-10 of string or object) | per-item 1:1, 2K |
| `matrix_upload_file` | `file_path` (required), `ttl`, `category` | 3600s, user_upload |

- `aspect_ratio`: `1:1` | `16:9` | `9:16` | `4:3` | `3:4` | `21:9`
- `resolution`: `1K` | `2K` | `4K`

## Notes

- Image synthesis can take from tens of seconds to minutes — the server keeps a generous timeout (50 min) mirroring the original client.
- Local files up to 500 MiB are auto-uploaded; files ≤ 600 KiB use the inline upload path.
- The `Matrix` client (`src/services/matrix.ts`) is a direct port of the repo's `main.ts`, with env-first token resolution.
