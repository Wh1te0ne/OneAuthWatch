export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const DEFAULT_WEB_STORE = JSON.stringify({ version: '1.0.0', accounts: [], config: {} });

function resolveWebApiBase(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const { hostname, port, origin } = window.location;
  if ((hostname === '127.0.0.1' || hostname === 'localhost') && (port === '5173' || port === '4173')) {
    return 'http://127.0.0.1:9211';
  }
  return origin;
}

async function loadWebAccountsStore(): Promise<string> {
  try {
    const response = await fetch(`${resolveWebApiBase()}/api/client/state`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return DEFAULT_WEB_STORE;
    }

    return JSON.stringify(await response.json());
  } catch (error) {
    console.warn('[Web Mode] Failed to fetch client state:', error);
    return DEFAULT_WEB_STORE;
  }
}

export async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
  }

  // Fallback mocks for running in Web Browser
  console.log(`[Web Mode] Intercepted Tauri invoke: ${cmd}`, args || '');

  switch (cmd) {
    case 'load_accounts_store':
      return await loadWebAccountsStore() as unknown as T;
    case 'save_accounts_store':
      return null as unknown as T;
    case 'read_codex_auth':
    case 'read_account_auth':
      return "{}" as unknown as T;
    case 'get_wham_account_metadata':
    case 'get_codex_wham_usage':
      return null as unknown as T;
    case 'read_file_content':
      return "{}" as unknown as T;
    default:
      return null as unknown as T;
  }
}
