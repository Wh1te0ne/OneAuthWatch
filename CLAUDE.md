# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

OneAuthWatch is a single repo that ships three cooperating surfaces for managing auth, quotas, and sync across AI coding accounts (Codex, Claude Code, Gemini, plus Antigravity / Copilot / MiniMax / OpenRouter / Z.ai / Synthetic on the server side):

- `client/` — **Tauri 2 + React 19 + TypeScript** desktop app. Frontend lives in `client/src/`; Rust host in `client/src-tauri/src/lib.rs` (a single large module exposing ~25 `#[tauri::command]` entry points for local file I/O, login flows, tray, auto-refresh). The same React bundle is built twice: once for desktop (`dist-desktop/`), once for embedding into the server at `/static/ui/` (`dist-web/`).
- `server/` — **Go 1.25** backend. Single-binary HTTP server on `:9211` with SQLite persistence (`modernc.org/sqlite`, pure Go, no CGO), embedded web UI, provider polling agents, and optional macOS menubar. Entry point `server/main.go`; feature packages under `server/internal/`.
- `.github/workflows/` — three pipelines: `desktop-release.yml` (Tauri bundles on tag push), `server-release.yml` (Go binaries, manual dispatch on existing tag), `docker-publish.yml` (pushes `ghcr.io/wh1te0ne/oneauthwatch-server` on `main` and tags).

The desktop is designed to work **standalone** even when the server is offline; the server can poll independently and the web dashboard is a read-only remote view. Desktop → server sync is one-way overwrite of the latest local snapshot.

## Common commands

### Desktop (`client/`)

```bash
npm install
npm run tauri:dev              # Tauri dev (spins up vite @ :5173 then loads it in a WebView)
npm run dev                    # Pure browser dev (no Tauri) — uses fetch fallbacks in src/utils/invoke.ts
npm run tauri:build            # Produce installer/bundle
npm run build:web              # React bundle for the Go server (dist-web/, base=/static/ui/)
npm run build:desktop          # React bundle for Tauri (dist-desktop/, base=/)
npm run build:web:sync         # build:web + copy into server/internal/web/static via PowerShell 7 script
npm run lint                   # eslint
```

Build-order note: `tauri build` calls `npm run build:desktop` via `beforeBuildCommand` in `tauri.conf.json`. Do not confuse the two outputs — `dist-web/` ships inside the Go binary; `dist-desktop/` ships inside the Tauri app.

### Server (`server/`)

Primary entry point is `./app.sh` (also wrapped by `Makefile`). Always run from inside `server/`.

```bash
./app.sh --build               # Production binary (on macOS links menubar via CGO with fyne.io/systray)
./app.sh --test                # Full test suite with -race + coverage
./app.sh --smoke               # vet + build check + -short tests (pre-commit check)
./app.sh --build --run         # Build then run in debug mode
./app.sh --release             # Cross-compile to dist/ for 5 platforms (CGO_ENABLED=0)
./app.sh --docker --build|--run|--stop|--clean    # Docker-based variants
./app.sh --clean               # Remove binary, coverage, dist/, test cache
make dev                       # go run . --debug --interval 10
make lint                      # go fmt ./... && go vet ./...
```

Running a single Go package or test:

```bash
go test ./internal/store/...                          # one package
go test -run TestCodexAgent ./internal/agent/...       # single test by name
go test -tags=integration ./...                       # integration suite (also `make integration`)
```

Runtime flags for the compiled `oneauthwatch-server` binary: `--debug` (foreground, dual-log), `--debugstdout` (foreground, stdout only — required for Docker), `--port`, `--interval`, `--db`, `--test` (isolated PID/logs for dev), plus subcommands `stop`, `status`, `setup`, `update`, `version`. Default dashboard: `http://127.0.0.1:9211/` and `/static/ui/`.

Docker (from `server/`): `docker compose up -d --build` for local builds, or `docker compose -f docker-compose.ghcr.yml pull && ... up -d` for the published GHCR image. Data is persisted at `/data/oneauthwatch.db` (host bind mount must be owned by UID 65532 — distroless `nonroot`).

## Desktop architecture

The React UI is a single-page dashboard (`client/src/App.tsx`) driven by:

- `stores/useAccountStore.ts` — Zustand store. Every mutation goes through helpers in `utils/storage.ts`, which in turn call **either** Tauri commands (desktop) **or** `/api/client/state` on the server (web-browser mode).
- `utils/invoke.ts` — `isTauri()` detection + `safeInvoke()` wrapper. In browser mode, most Tauri commands return benign defaults; `load_accounts_store` falls back to fetching `GET /api/client/state` from `127.0.0.1:9211` (or same-origin when served from the Go binary).
- `hooks/useAutoRefresh.ts` — interval-driven quota refresh.
- `components/` — modal/dialog-heavy UI (`AddAccountModal`, `QuickLoginModal`, `SettingsModal`, `CloseBehaviorDialog`, `AccountCard`, `UsageBar`, …).

Rust side (`src-tauri/src/lib.rs`) owns:

- Reading/writing `%USERPROFILE%\.codex\auth.json`, `%USERPROFILE%\.claude\*`, and Gemini credential files.
- Per-account storage under `%LOCALAPPDATA%\OneAuthWatch\` and `%USERPROFILE%\.oneauthwatch\auths\{id}.json` (plaintext JSON — keep in mind when reviewing).
- Driving the Codex / Claude CLI login flows as child processes (`start_codex_login`, `start_claude_login`, `cancel_codex_login`), watching the auth file with `notify`, and emitting Tauri events.
- Tray icon + menu (`TrayIconBuilder`), close-to-tray, auto-refresh tick, "hide_to_tray" / "exit_application".

When adding a frontend feature that touches the filesystem or calls providers, prefer adding a `#[tauri::command]` + a helper in `utils/storage.ts` rather than reaching into `@tauri-apps/api` directly — the store layer already handles the desktop-vs-web split.

## Server architecture

`server/main.go` is the single wiring file. It:

1. Parses flags, sets up `slog` (dual handler in `--debug` mode: file gets everything, stdout gets warn/error).
2. Daemonizes unless `--debug` / `--debugstdout` / Docker is detected (`config.IsDockerEnvironment()`).
3. Opens SQLite at `~/.oneauthwatch/data/oneauthwatch.db`, runs migrations, constructs the notify engine, starts the `agent.AgentManager`, then the `web.Server`.

The server is organised by provider across parallel packages. Each provider has a matching file triplet:

- `internal/api/<provider>_client.go` + `<provider>_types.go` — HTTP client for that upstream (Anthropic OAuth, Codex WHAM, Gemini, Copilot, MiniMax, Antigravity, Z.ai, OpenRouter).
- `internal/agent/<provider>_agent.go` — goroutine that polls on an interval and writes snapshots. `manager.go` starts/stops them dynamically based on enabled config; `session_manager.go` owns cross-agent session lifecycle. Agents with sub-accounts (Codex, MiniMax) also have a `<provider>_agent_manager.go`.
- `internal/store/<provider>_store.go` — provider-specific queries on top of the shared `Store` (`store.go`). `migration.go` is the schema owner.
- `internal/tracker/<provider>_tracker.go` — computes derived metrics (burn rate, projection, etc.) from snapshots for the dashboard.

Cross-cutting packages:

- `internal/web/` — `server.go` registers ~50 routes on `net/http.ServeMux`. `handlers.go` holds the generic REST handlers (`/api/current`, `/api/history`, `/api/cycles`, `/api/summary`, `/api/insights`, `/api/sessions`, `/api/providers`, `/api/settings`, …). Provider-specific handlers live in `gemini_handlers.go`, `minimax_handlers_test.go`, etc. `middleware.go` handles basic-auth gating (`ONEAUTHWATCH_ADMIN_USER/PASS`), CSRF, and rate limits. `security.go` + `crypto.go` encrypt stored secrets. Templates are in `internal/web/templates/`, static assets in `internal/web/static/` — both embedded via `//go:embed`.
- `internal/notify/` — threshold engine + SMTP mailer + Web Push (VAPID/RFC 8291, HKDF via `golang.org/x/crypto`). SMTP passwords are encrypted at rest (`notify/crypto.go`, AES-GCM).
- `internal/menubar/` — macOS menubar companion (Cocoa bridge in `.m` files, `fyne.io/systray` on other platforms through `menubar_stub.go`). Built with `-tags menubar,desktop,production` on Darwin.
- `internal/update/` — self-update: GitHub releases check, binary magic-byte validation (ELF/Mach-O/PE), remove+rename (Unix) or backup+rename (Windows), systemd unit migration. Triggered from the dashboard footer or `oneauthwatch-server update`.
- `internal/config/` — env loading via `godotenv`. Provider env vars are `ANTHROPIC_TOKEN`, `CODEX_TOKEN`, `GEMINI_REFRESH_TOKEN` + `GEMINI_ACCESS_TOKEN`, `COPILOT_TOKEN`, `MINIMAX_API_KEY`, `OPENROUTER_API_KEY`, `ZAI_API_KEY`, `SYNTHETIC_API_KEY`, `ANTIGRAVITY_*`. Configuring zero providers is an error on boot.
- `internal/testutil/` — mock HTTP server, fixtures, and helpers shared across packages. The top-level `integration_test.go` + `root_coverage*_test.go` + `main_test.go` drive end-to-end boot paths.

The dashboard is provider-aware through the `?provider=` query param; every REST handler dispatches to the corresponding store. When adding a new provider, mirror the existing quadruple (`api`, `agent`, `store`, `tracker`) and wire it into `agent/manager.go`, the handler dispatch in `web/handlers.go`, and `config/config.go`.

## Client ↔ server contract

- Sync: desktop calls `POST /api/credentials` (handler `SyncCredentials`) with the full local snapshot; the server persists it and exposes it back via `GET /api/client/state` (handler `ClientState`), which is what the React bundle in web-mode reads.
- The same React bundle is served at `/static/ui/` when `build:web:sync` has been run against the server. The script `server/scripts/sync-web-ui.ps1` copies `client/dist-web/` into `server/internal/web/static/` before `go build` embeds it.

## Things to know

- Line endings: the repo is mostly LF but `.ps1` and `.bat` keep CRLF. Don't rewrite them en masse.
- Secrets encryption: anything the server stores long-term (SMTP password, provider tokens when written from the UI) goes through `internal/notify/crypto.go` / `internal/web/crypto.go`. Tokens supplied via env are not re-encrypted.
- Cross-compile cleanliness: the server must stay CGO-free on non-Darwin targets (pure-Go SQLite). Anything Darwin-only goes behind `//go:build darwin` and the `menubar` tag. Check `platform_windows.go` / `platform_unix.go` before adding OS syscalls.
- Tests: `go test -race ./...` is the pre-commit gate (`./app.sh --smoke` wraps a lighter version). The suite in `main_test.go` + `root_coverage*_test.go` is load-bearing for coverage — prefer extending them over adding a new top-level test file.
- `server/AGENTS.md` just points back to `CLAUDE.md`. Any server-wide convention updates should live here, not there.

## Existing subdirectory docs

- [client/CLAUDE.md](client/CLAUDE.md) — heavyweight Chinese-language workflow contract (mandatory Simplified Chinese for all prose/comments, tool-chain order, reuse-over-rewrite, etc.). If you're editing under `client/`, read it first — the language rule applies to anything you write into files there.
- [client/README.md](client/README.md) — end-user desktop usage.
- [server/README.md](server/README.md) — local/Docker/cloud run modes.
- [server/docs/DEVELOPMENT.md](server/docs/DEVELOPMENT.md) — deep dive on build/release/perf/self-update.
- [server/docs/](server/docs/) — per-provider setup (`CODEX_SETUP.md`, `GEMINI_SETUP.md`, `COPILOT_SETUP.md`, `ANTIGRAVITY_SETUP.md`, `MINIMAX_SETUP.md`, `WINDOWS_SETUP.md`, plus `ENCRYPTION_IMPLEMENTATION.md`).
