import { useEffect, useRef, useCallback, useState } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { isTauri, safeInvoke as invoke } from '../utils/invoke';
import type { StoredAccount, UsageInfo } from '../types';

/**
 * Rust 后端返回的用量数据结构
 */
interface RustUsageData {
  five_hour_percent_left: number;
  five_hour_reset_time_ms: number;
  weekly_percent_left: number;
  weekly_reset_time_ms: number;
  last_updated: string;
}

interface RustUsageResult {
  status: 'ok' | 'missing_account_id' | 'missing_token' | 'no_codex_access' | 'no_usage' | 'expired' | 'forbidden' | 'error';
  message?: string;
  plan_type?: string;
  usage?: RustUsageData;
}


const formatResetTime = (resetTimeMs: number, includeWeekday: boolean): string => {
  if (!Number.isFinite(resetTimeMs) || resetTimeMs <= 0) {
    return '';
  }

  const date = new Date(resetTimeMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  if (!includeWeekday) {
    return `${hours}:${minutes}`;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
};

const buildUsageInfo = (usageData: RustUsageData, planType?: string): UsageInfo => ({
  status: 'ok',
  planType,
  fiveHourLimit: {
    percentLeft: Math.round(usageData.five_hour_percent_left),
    resetTime: formatResetTime(usageData.five_hour_reset_time_ms, false),
  },
  weeklyLimit: {
    percentLeft: Math.round(usageData.weekly_percent_left),
    resetTime: formatResetTime(usageData.weekly_reset_time_ms, true),
  },
  lastUpdated: usageData.last_updated,
});

const buildStatusUsageInfo = (result: RustUsageResult): UsageInfo => ({
  status: result.status,
  message: result.message,
  planType: result.plan_type,
  lastUpdated: new Date().toISOString(),
});

/**
 * 自动刷新用量数据的 Hook
 */
export function useAutoRefresh() {
  const { accounts, updateUsage, activeAccountId, syncCurrentAccount } = useAccountStore();
  const authCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);
  const autoRefreshAccountIdRef = useRef<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  type RefreshStatus =
    | 'success'
    | 'no-usage'
    | 'missing-account-id'
    | 'missing-token'
    | 'no-codex-access'
    | 'expired'
    | 'forbidden'
    | 'error'
    | 'skipped';
  type RefreshResult = { status: RefreshStatus; message?: string };
  type RefreshAllResult = { updated: number; missing: number; skipped: boolean };


  /**
   * 获取单个账号的用量信息
   * 通过 wham/usage API 获取 Codex quota
   */
  const fetchAccountUsage = useCallback(async (account: StoredAccount): Promise<{
    usage: UsageInfo | null;
    status: RefreshStatus;
  }> => {
    if (!isTauri()) {
      return { usage: null, status: 'skipped' };
    }

    try {
      // Keep the active account snapshot aligned with Codex auto-refreshed auth.json.
      if (account.provider === 'codex' && activeAccountId && account.id === activeAccountId) {
        await syncCurrentAccount();
      }

      const command =
        account.provider === 'claude'
          ? 'get_claude_usage'
          : account.provider === 'gemini'
            ? 'get_gemini_usage'
            : 'get_codex_wham_usage';

      const usageResult = await invoke<RustUsageResult>(command, {
        accountId: account.id,
      });

      if (usageResult.status === 'ok' && usageResult.usage) {
        return {
          usage: buildUsageInfo(usageResult.usage, usageResult.plan_type),
          status: 'success',
        };
      }
      const statusMap: Partial<Record<RustUsageResult['status'], RefreshStatus>> = {
        no_usage: 'no-usage',
        missing_account_id: 'missing-account-id',
        missing_token: 'missing-token',
        no_codex_access: 'no-codex-access',
        expired: 'expired',
        forbidden: 'forbidden',
        error: 'error',
      };
      const mappedStatus = statusMap[usageResult.status] ?? 'error';
      return { usage: buildStatusUsageInfo(usageResult), status: mappedStatus };
    } catch (error) {
      console.error(`Failed to fetch usage for account ${account.id}:`, error);
      return {
        usage: {
          status: 'error',
          message: error instanceof Error ? error.message : '额度请求失败',
          lastUpdated: new Date().toISOString(),
        },
        status: 'error',
      };
    }
  }, [activeAccountId, syncCurrentAccount]);

  /**
   * 刷新所有账号的用量
   */
  const refreshAllUsage = useCallback(async (): Promise<RefreshAllResult> => {
    if (isRefreshingRef.current || accounts.length === 0) {
      return { updated: 0, missing: 0, skipped: true };
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    let updated = 0;
    let missing = 0;

    try {
      for (const account of accounts) {
        const { usage, status } = await fetchAccountUsage(account);
        // 无论成功还是失败都保存 usage 信息，让 UI 能展示错误状态
        if (usage) {
          await updateUsage(account.id, usage);
        }
        if (status === 'success') {
          updated += 1;
        } else {
          missing += 1;
        }
        // 添加延迟避免过快请求
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return { updated, missing, skipped: false };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [accounts, fetchAccountUsage, updateUsage]);

  /**
   * 刷新单个账号的用量
   */
  const refreshSingleAccount = useCallback(async (accountId: string): Promise<RefreshResult> => {
    if (isRefreshingRef.current) {
      return { status: 'skipped' };
    }

    const targetAccount = accounts.find((account) => account.id === accountId);
    if (!targetAccount) {
      return { status: 'skipped' };
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    let status: RefreshStatus = 'no-usage';
    let message: string | undefined;

    try {
      const { usage, status: fetchStatus } = await fetchAccountUsage(targetAccount);
      status = fetchStatus === 'success' ? 'success' : fetchStatus;
      message = usage?.message;

      // 无论成功还是失败都保存 usage 信息
      if (usage) {
        await updateUsage(accountId, usage);
      }

      return { status, message };
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [accounts, fetchAccountUsage, updateUsage]);

  // 当前活跃账号变化时自动刷新 quota
  useEffect(() => {
    if (!isTauri()) {
      autoRefreshAccountIdRef.current = null;
      return;
    }

    if (!activeAccountId) {
      autoRefreshAccountIdRef.current = null;
      return;
    }

    if (autoRefreshAccountIdRef.current === activeAccountId) {
      return;
    }

    const activeAccount = accounts.find(account => account.id === activeAccountId);
    if (!activeAccount) return;

    const runAutoRefresh = async () => {
      autoRefreshAccountIdRef.current = activeAccountId;
      await refreshSingleAccount(activeAccountId);
    };

    void runAutoRefresh();
  }, [accounts, activeAccountId, refreshSingleAccount]);

  // 定期检测外部登录/登出操作并同步前端状态
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    if (authCheckIntervalRef.current) {
      clearInterval(authCheckIntervalRef.current);
    }

    const AUTH_CHECK_INTERVAL = 30 * 1000;
    authCheckIntervalRef.current = setInterval(() => {
      syncCurrentAccount();
    }, AUTH_CHECK_INTERVAL);

    return () => {
      if (authCheckIntervalRef.current) {
        clearInterval(authCheckIntervalRef.current);
      }
    };
  }, [syncCurrentAccount]);

  return {
    refreshAllUsage,
    refreshSingleAccount,
    isRefreshing,
  };
}

export default useAutoRefresh;
