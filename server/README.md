# OneAuthWatch Server

`server/` is the backend for OneAuthWatch.

It handles:
- SQLite persistence
- provider polling and quota refresh
- embedded web dashboard delivery
- desktop-to-server sync
- remote querying from other environments

## Local Run

```powershell
Set-Location E:\OneAuthWatch\server
go build -o .\oneauthwatch-server.exe .
.\oneauthwatch-server.exe --debugstdout
```

Web entry:

- `http://127.0.0.1:9211/static/ui/`

## Docker Modes

### 1. Local build mode

Use this when you are developing or testing Docker locally:

```powershell
Set-Location E:\OneAuthWatch\server
Copy-Item .env.docker.example .env
docker compose up -d --build
```

This uses [`docker-compose.yml`](./docker-compose.yml) and builds from local source.

### 2. Cloud pull mode

Use this on your VPS or cloud server after GitHub Actions has published the image:

```powershell
Set-Location /srv/oneauthwatch
cp /path/to/.env.docker.example ./.env
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

This uses [`docker-compose.ghcr.yml`](./docker-compose.ghcr.yml) and pulls:

- `ghcr.io/wh1te0ne/oneauthwatch-server:latest`

If you later publish a version tag such as `v0.1.0`, you can pin the image to:

- `ghcr.io/wh1te0ne/oneauthwatch-server:v0.1.0`

If the package is private, log in first:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u Wh1te0ne --password-stdin
```

## Environment

Copy `.env.example` or `.env.docker.example` and fill only the providers you actually use.

Common variables:
- `ONEAUTHWATCH_PORT`
- `ONEAUTHWATCH_DB_PATH`
- `ONEAUTHWATCH_LOG_LEVEL`
- `ONEAUTHWATCH_POLL_INTERVAL`

Optional auth variables:
- `ONEAUTHWATCH_ADMIN_USER`
- `ONEAUTHWATCH_ADMIN_PASS`

Provider variables can include:
- `CODEX_TOKEN`
- `ANTHROPIC_TOKEN`
- `GEMINI_REFRESH_TOKEN`
- `GEMINI_ACCESS_TOKEN`
- `COPILOT_TOKEN`
- `MINIMAX_API_KEY`
- `OPENROUTER_API_KEY`
- `ZAI_API_KEY`
- `SYNTHETIC_API_KEY`

## Release Flow

- Push to `main`: GitHub Actions builds and pushes `latest` to GHCR.
- Push a tag like `v0.1.0`: GitHub Actions also publishes versioned Docker tags.
- Your cloud server only needs a compose file and `docker compose pull`.

## Note

Current product focus is Codex, Claude Code, and Gemini.
The desktop remains independently usable even when the server is offline.
