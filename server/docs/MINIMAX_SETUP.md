# MiniMax Setup Guide

This guide configures MiniMax Coding Plan usage tracking in OneAuthWatch.

## Prerequisites

- Active MiniMax Coding Plan subscription
- OneAuthWatch v2.11+

## 1. Get a MiniMax API Key

1. Open https://platform.minimax.io
2. Go to **API Keys**
3. Create or copy an API key

## 2. Configure OneAuthWatch

Add this to your environment file (`~/.oneauthwatch/.env` for local installs):

```env
MINIMAX_API_KEY=sk-cp-your_key_here
```

**Region** (optional, default: `global`):

```env
MINIMAX_REGION=cn    # Use MiniMax CN endpoint (www.minimaxi.com)
```

Set `MINIMAX_REGION=cn` if you're using MiniMax from China; otherwise omit for the global endpoint (`api.minimax.io`).

## 3. Reload Providers

You can apply the new key without full restart:

1. Open **Settings -> Providers**
2. Click **Reload Providers From .env**
3. Enable **MiniMax** telemetry and dashboard toggle

Or restart OneAuthWatch:

```bash
oneauthwatch-server stop
oneauthwatch-server
```

## 4. Verify

- Open the dashboard and switch to the **MiniMax** tab
- Check that quota cards and history begin populating
- In Settings, confirm MiniMax status shows configured/polling

## Notes

- MiniMax endpoint used by OneAuthWatch:
  `https://api.minimax.io/v1/api/openplatform/coding_plan/remains`
- Auth is sent as a `Bearer` token.
- OneAuthWatch stores usage snapshots locally in SQLite.
