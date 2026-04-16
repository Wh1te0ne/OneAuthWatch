export type PlanFilterValue = 'all' | 'free' | 'plus' | 'pro' | 'team';
export type ExpiryFilterValue =
  | 'all'
  | 'expired'
  | 'within-24h'
  | 'within-7d'
  | 'within-30d'
  | 'missing';
export type LimitFilterValue = 'all' | '0-33' | '33-66' | '66-100';

export type AccountFilterState = {
  plan: PlanFilterValue;
  expiry: ExpiryFilterValue;
  weekly: LimitFilterValue;
  hourly: LimitFilterValue;
};

export const DEFAULT_ACCOUNT_FILTERS: AccountFilterState = {
  plan: 'all',
  expiry: 'all',
  weekly: 'all',
  hourly: 'all',
};
