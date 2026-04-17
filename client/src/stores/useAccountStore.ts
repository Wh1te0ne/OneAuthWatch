import { create } from 'zustand';
import type { StoredAccount, AccountsStore, AppConfig, UsageInfo, CodexAuthConfig } from '../types';
import { isTauri } from '../utils/invoke';
import {
  loadAccountsStore,
  loadServerAccountsStore,
  saveAccountsStore,
  switchToAccount as switchAccount,
  addAccount as addAccountToStore,
  removeAccount as removeAccountFromStore,
  updateAccountUsage as updateUsage,
  syncCurrentAccount as syncCurrent,
  isMissingIdentityError,
  refreshAccountsWorkspaceMetadata,
  type AddAccountOptions,
} from '../utils/storage';

interface AccountState {
  // 状态
  accounts: StoredAccount[];
  activeAccountId: string | null;
  config: AppConfig;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadAccounts: () => Promise<void>;
  syncCurrentAccount: () => Promise<void>;
  addAccount: (authJson: string, alias?: string, options?: AddAccountOptions) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  switchToAccount: (accountId: string) => Promise<void>;
  updateUsage: (accountId: string, usage: UsageInfo) => Promise<void>;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  refreshAllUsage: () => Promise<void>;
  syncToServer: () => Promise<void>;
  setError: (message: string) => void;
  clearError: () => void;
}

function normalizeIdentityPart(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function findServerMergeMatch(localAccounts: StoredAccount[], serverAccount: StoredAccount): number {
  const serverEmail = normalizeIdentityPart(serverAccount.accountInfo.email);
  const serverAccountId = normalizeIdentityPart(serverAccount.accountInfo.accountId);
  const serverUserId = normalizeIdentityPart(serverAccount.accountInfo.userId);

  return localAccounts.findIndex((account) => {
    if (account.provider !== serverAccount.provider) {
      return false;
    }

    const localEmail = normalizeIdentityPart(account.accountInfo.email);
    const localAccountId = normalizeIdentityPart(account.accountInfo.accountId);
    const localUserId = normalizeIdentityPart(account.accountInfo.userId);

    if (serverEmail && localEmail && serverEmail === localEmail) {
      return true;
    }
    if (serverAccountId && localAccountId && serverAccountId === localAccountId) {
      return true;
    }
    if (serverUserId && localUserId && serverUserId === localUserId) {
      return true;
    }
    return false;
  });
}

function mergeServerAccounts(localAccounts: StoredAccount[], serverAccounts: StoredAccount[]): StoredAccount[] {
  const merged = [...localAccounts];
  const seen = new Set(localAccounts.map((account) => `${account.provider}:${account.id}`));

  for (const account of serverAccounts) {
    if (account.provider === 'codex') {
      continue;
    }

    const matchedIndex = findServerMergeMatch(merged, account);
    if (matchedIndex >= 0) {
      merged[matchedIndex] = {
        ...merged[matchedIndex],
        accountInfo: {
          ...merged[matchedIndex].accountInfo,
          ...account.accountInfo,
        },
        usageInfo: merged[matchedIndex].usageInfo ?? account.usageInfo,
        updatedAt: account.updatedAt || merged[matchedIndex].updatedAt,
        isActive: false,
      };
      continue;
    }

    const key = `${account.provider}:${account.id}`;
    if (seen.has(key)) {
      continue;
    }

    merged.push({
      ...account,
      isActive: false,
    });
    seen.add(key);
  }

  return merged;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  config: {
    autoRefreshInterval: 30,
    closeBehavior: 'ask',
    theme: 'dark',
    hasInitialized: false,
  },
  isLoading: false,
  error: null,
  
  loadAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const store = await loadAccountsStore();
      const activeAccount = store.accounts.find(a => a.isActive);
      const localConfig = store.config;
      let initialAccounts = store.accounts;

      if (isTauri() && localConfig.serverUrl) {
        try {
          const serverStore = await loadServerAccountsStore(localConfig.serverUrl);
          initialAccounts = mergeServerAccounts(store.accounts, serverStore.accounts);
        } catch (error) {
          console.warn('Failed to load initial server accounts:', error);
        }
      }

      set({ 
        accounts: initialAccounts, 
        activeAccountId: activeAccount?.id || null,
        config: localConfig,
        isLoading: false 
      });

      if (!isTauri()) {
        return;
      }

      // 加载后自动同步当前登录账号
      await get().syncCurrentAccount();

      const refreshedAccounts = await refreshAccountsWorkspaceMetadata();
      const refreshedActiveAccount = refreshedAccounts.find((account) => account.isActive);
      let mergedAccounts = refreshedAccounts;

      if (localConfig.serverUrl) {
        try {
          const serverStore = await loadServerAccountsStore(localConfig.serverUrl);
          mergedAccounts = mergeServerAccounts(refreshedAccounts, serverStore.accounts);
        } catch (error) {
          console.warn('Failed to load server accounts:', error);
        }
      }

      set({
        accounts: mergedAccounts,
        activeAccountId: refreshedActiveAccount?.id || get().activeAccountId,
      });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to load accounts' 
      });
    }
  },
  
  syncCurrentAccount: async () => {
    if (!isTauri()) {
      return;
    }

    try {
      const matchedId = await syncCurrent();
      
      // 更新本地状态（包括未登录时清除所有激活状态）
      const { accounts } = get();
      const updatedAccounts = accounts.map(a => ({
        ...a,
        isActive: matchedId ? a.id === matchedId : false,
      }));
      
      set({ 
        accounts: updatedAccounts, 
        activeAccountId: matchedId,
      });
    } catch (error) {
      console.error('Failed to sync current account:', error);
    }
  },
  
  addAccount: async (authJson: string, alias?: string, options?: AddAccountOptions) => {
    set({ isLoading: true, error: null });
    try {
      const authConfig = JSON.parse(authJson);
      const newAccount = await addAccountToStore(authConfig, alias, options);
      
      // 更新本地状态
      const { accounts } = get();
      const existingIndex = accounts.findIndex(a => a.id === newAccount.id);
      
      if (existingIndex >= 0) {
        const updated = [...accounts];
        updated[existingIndex] = newAccount;
        set({ accounts: updated, isLoading: false });
      } else {
        set({ 
          accounts: [...accounts, newAccount],
          activeAccountId: accounts.length === 0 ? newAccount.id : get().activeAccountId,
          isLoading: false 
        });
      }
    } catch (error) {
      if (isMissingIdentityError(error)) {
        set({ isLoading: false, error: null });
        throw error;
      }
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to add account' 
      });
      throw error;
    }
  },
  
  removeAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      await removeAccountFromStore(accountId);
      const { accounts, activeAccountId } = get();
      const newAccounts = accounts.filter(a => a.id !== accountId);
      
      // 如果删除的是活动账号，切换到第一个账号
      let newActiveId = activeAccountId;
      if (activeAccountId === accountId) {
        newActiveId = newAccounts[0]?.id || null;
      }
      
      set({ 
        accounts: newAccounts, 
        activeAccountId: newActiveId,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to remove account' 
      });
    }
  },
  
  switchToAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      await switchAccount(accountId);
      
      // 更新本地状态
      const { accounts } = get();
      const updatedAccounts = accounts.map(a => ({
        ...a,
        isActive: a.id === accountId,
      }));
      
      set({ 
        accounts: updatedAccounts, 
        activeAccountId: accountId,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Failed to switch account' 
      });
    }
  },
  
  updateUsage: async (accountId: string, usage: UsageInfo) => {
    try {
      await updateUsage(accountId, usage);
      
      const { accounts } = get();
      const updatedAccounts = accounts.map(a => 
        a.id === accountId ? { ...a, usageInfo: usage } : a
      );
      
      set({ accounts: updatedAccounts });
    } catch (error) {
      console.error('Failed to update usage:', error);
    }
  },
  
  updateConfig: async (config: Partial<AppConfig>) => {
    const { accounts, config: currentConfig } = get();
    const newConfig = { ...currentConfig, ...config };
    
    const store: AccountsStore = {
      version: '1.0.0',
      accounts,
      config: newConfig,
    };
    
    await saveAccountsStore(store);
    set({ config: newConfig });
  },
  
  refreshAllUsage: async () => {
    // 这个功能需要依次切换账号并获取用量
    // 由于codex /status需要交互式运行，这里暂时只是一个占位
    console.log('Refreshing all usage...');
  },
  
  syncToServer: async () => {
    try {
      const { config, accounts } = get();
      if (!config.serverUrl) throw new Error('未配置服务器地址');
      const codexAccounts = accounts.filter((account) => account.provider === 'codex');
      
      const snapshot: AccountsStore = {
        version: '1.0.0',
        accounts,
        config,
      };

      let codexToken = '';
      let accountAuths: Array<{
        account_id: string;
        alias?: string;
        auth_config: CodexAuthConfig;
      }> = [];
      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        try {
          const authJson = await invoke<string>('read_codex_auth');
          const auth = JSON.parse(authJson);
          codexToken = auth?.tokens?.access_token || auth?.access_token || '';
        } catch {
          console.warn('Cannot read codex auth');
        }

        accountAuths = await Promise.all(
          codexAccounts.map(async (account) => {
            try {
              const authJson = await invoke<string>('read_account_auth', {
                accountId: account.id,
              });
              return {
                account_id: account.id,
                alias: account.alias || undefined,
                auth_config: JSON.parse(authJson) as CodexAuthConfig,
              };
            } catch (error) {
              const reason = error instanceof Error ? error.message : String(error);
              throw new Error(`无法读取账号 ${account.alias || account.id} 的 auth 配置: ${reason}`);
            }
          })
        );
      }

      const normalizedServerUrl = config.serverUrl.replace(/\/$/, '');
      const payload = JSON.stringify({
        codex_token: codexToken || undefined,
        client_state: snapshot,
        account_auths: accountAuths,
      });

      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('sync_remote_accounts_store', {
          serverUrl: normalizedServerUrl,
          payload,
        });
      } else {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        };

        const res = await fetch(`${normalizedServerUrl}/api/credentials`, {
          method: 'POST',
          headers,
          body: payload,
        });

        if (!res.ok) {
          throw new Error(`同步失败: ${res.status} ${res.statusText}`);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      if (typeof error === 'string' && error.trim()) {
        throw new Error(error);
      }
      try {
        throw new Error(JSON.stringify(error));
      } catch {
        throw new Error('服务器同步失败');
      }
    }
  },
  
  setError: (message: string) => set({ error: message }),
  clearError: () => set({ error: null }),
}));
