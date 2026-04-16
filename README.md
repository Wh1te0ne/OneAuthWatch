# OneAuthWatch

OneAuthWatch is a local-first multi-provider quota and auth operations product.

It combines:
- Windows desktop client for local auth reading, quota refresh, and server sync
- Go backend service with database, polling, and web dashboard delivery
- Web dashboard for viewing synced and server-side refreshed account usage

## Repository Scope

This repository is intended to track the actual product code only:
- [client](E:\OneAuthWatch\client)
- [server](E:\OneAuthWatch\server)

The local reference directories below are excluded from version control and are not part of the publishable product repository:
- `codex-auth-manager-main`
- `onWatch-main`

## Attribution

During prototyping and product shaping, this project referenced ideas and implementation patterns from:
- `CodexAuthManager`
- `onWatch`

OneAuthWatch is the integrated product codebase built on top of those references, with its own local-first sync flow, desktop packaging, server deployment path, and multi-provider quota logic.

## Architecture

- `client/`
  - React + Tauri desktop app
  - local auth/config reading
  - local quota refresh for supported providers
  - sync to server
- `server/`
  - Go service
  - SQLite persistence
  - provider polling and aggregation
  - embedded web UI delivery

## Current Product Direction

OneAuthWatch focuses on:
- Codex auth and quota management
- Claude Code quota reading and analysis
- Gemini quota reading and analysis
- local-first state accuracy
- optional server-side sync and remote querying

## Local Development

Desktop:

```powershell
Set-Location E:\OneAuthWatch\client
npm.cmd install
npm.cmd run dev
```

Desktop build:

```powershell
Set-Location E:\OneAuthWatch\client
npm.cmd run tauri build
```

Server:

```powershell
Set-Location E:\OneAuthWatch\server
go build -o .\server.new.exe .
.\server.new.exe --debugstdout
```

Web entry after server start:

- `http://127.0.0.1:9211/static/ui/`

## Notes

- Server-side dashboard auth is disabled by default.
- Reference source trees remain local for comparison and are intentionally excluded from Git history.
- GitHub release, updater, and Go module owner wiring still need the final GitHub repository owner before they can be fully locked in.
