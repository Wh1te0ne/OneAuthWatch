# OneAuthWatch

[English](./README.en.md) | [简体中文](./README.zh-CN.md)

OneAuthWatch is a local-first auth, quota, and sync workspace for AI coding accounts.

It brings together:
- a Windows desktop app for reading local auth state and refreshing quotas
- a Go server for persistence, polling, and remote querying
- a web dashboard for synced and server-refreshed account visibility

## Highlights

- Supports Codex, Claude Code, and Gemini
- Desktop remains usable without the server
- Server keeps historical polling and refresh snapshots
- Desktop can overwrite-sync the latest local state upstream
- Web dashboard gives remote visibility into synced accounts

## Repository Layout

- [`client/`](./client/)  
  React + Tauri desktop application
- [`server/`](./server/)  
  Go backend, embedded web UI, database, and refresh workers

## Quick Start

Desktop development:

```powershell
Set-Location .\client
npm.cmd install
npm.cmd run dev
```

Desktop installer build:

```powershell
Set-Location .\client
npm.cmd run tauri build
```

Local server run:

```powershell
Set-Location .\server
go build -o .\oneauthwatch-server.exe .
.\oneauthwatch-server.exe --debugstdout
```

Docker server run:

```powershell
Set-Location .\server
docker compose up -d --build
```

Cloud server pull deployment:

```bash
cd /srv/oneauthwatch
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Default published image:

- `ghcr.io/wh1te0ne/oneauthwatch-server:latest`

## Product Direction

- The desktop is the local operating surface.
- The server adds history, remote query, and multi-environment visibility.
- The web dashboard is intended as a companion view, not a replacement for the desktop client.

## References

During product exploration and technical comparison, this project referenced:
- CodexAuthManager
- onWatch

OneAuthWatch is the product codebase built on its own architecture and workflow decisions.
