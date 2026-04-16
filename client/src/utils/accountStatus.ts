import type { StoredAccount } from '../types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 7;
const EXPIRING_MONTH_DAYS = 30;

export type SubscriptionPresentation = {
  detailText: string;
  valueText: string;
  barPercent: number;
  barClassName: string;
};

export type AccountExpirationState = 'missing' | 'active' | 'expiring' | 'expired';
export type AccountExpiryBucket =
  | 'missing'
  | 'expired'
  | 'within-24h'
  | 'within-7d'
  | 'within-30d'
  | 'active';

export function parseSubscriptionDate(value?: string): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    let timestamp = Number(trimmed);
    if (!Number.isFinite(timestamp)) return null;
    if (timestamp < 1_000_000_000_000) {
      timestamp *= 1000;
    }
    const numericDate = new Date(timestamp);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatSubscriptionDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function getSubscriptionExpirationState(
  subscriptionActiveUntil?: string
): AccountExpirationState {
  const subscriptionDate = parseSubscriptionDate(subscriptionActiveUntil);

  if (!subscriptionDate) {
    return 'missing';
  }

  const diffMs = subscriptionDate.getTime() - Date.now();
  if (diffMs <= 0) {
    return 'expired';
  }
  if (diffMs <= EXPIRING_SOON_DAYS * DAY_IN_MS) {
    return 'expiring';
  }
  return 'active';
}

export function getSubscriptionPresentation(
  subscriptionActiveUntil?: string
): SubscriptionPresentation {
  const subscriptionDate = parseSubscriptionDate(subscriptionActiveUntil);

  if (!subscriptionDate) {
    return {
      detailText: '字段缺失',
      valueText: '未知',
      barPercent: 0,
      barClassName: 'bg-slate-300',
    };
  }

  const diffMs = subscriptionDate.getTime() - Date.now();
  const formattedDate = formatSubscriptionDate(subscriptionDate);
  const barPercent = Math.max(6, Math.min(100, Math.round((diffMs / (DAY_IN_MS * 30)) * 100)));

  if (diffMs <= 0) {
    return {
      detailText: formattedDate,
      valueText: '已过期',
      barPercent: 0,
      barClassName: 'bg-rose-500',
    };
  }

  if (diffMs < DAY_IN_MS) {
    const hoursLeft = Math.max(1, Math.ceil(diffMs / HOUR_IN_MS));
    return {
      detailText: formattedDate,
      valueText: `${hoursLeft}小时`,
      barPercent,
      barClassName: 'bg-amber-500',
    };
  }

  const daysLeft = Math.ceil(diffMs / DAY_IN_MS);
  const daysLeftText = daysLeft > 99 ? '99+天' : `${daysLeft}天`;

  if (daysLeft <= EXPIRING_SOON_DAYS) {
    return {
      detailText: formattedDate,
      valueText: daysLeftText,
      barPercent,
      barClassName: 'bg-amber-500',
    };
  }

  return {
    detailText: formattedDate,
    valueText: daysLeftText,
    barPercent,
    barClassName: 'bg-emerald-500',
  };
}

export function isAccountExpired(account: StoredAccount): boolean {
  return (
    account.usageInfo?.status === 'expired' ||
    getSubscriptionExpirationState(account.accountInfo.subscriptionActiveUntil) === 'expired'
  );
}

export function isAccountExpiringSoon(account: StoredAccount): boolean {
  return getSubscriptionExpirationState(account.accountInfo.subscriptionActiveUntil) === 'expiring';
}

export function getAccountExpiryBucket(account: StoredAccount): AccountExpiryBucket {
  if (account.usageInfo?.status === 'expired') {
    return 'expired';
  }

  const subscriptionDate = parseSubscriptionDate(account.accountInfo.subscriptionActiveUntil);
  if (!subscriptionDate) {
    return 'missing';
  }

  const diffMs = subscriptionDate.getTime() - Date.now();
  if (diffMs <= 0) {
    return 'expired';
  }
  if (diffMs <= HOUR_IN_MS * 24) {
    return 'within-24h';
  }
  if (diffMs <= DAY_IN_MS * EXPIRING_SOON_DAYS) {
    return 'within-7d';
  }
  if (diffMs <= DAY_IN_MS * EXPIRING_MONTH_DAYS) {
    return 'within-30d';
  }
  return 'active';
}
