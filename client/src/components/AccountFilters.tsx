import React from 'react';
import type {
  AccountFilterState,
  ExpiryFilterValue,
  LimitFilterValue,
} from '../types/accountFilters';

type FilterOption<T extends string> = {
  value: T;
  label: string;
};

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

interface AccountFiltersProps {
  filters: AccountFilterState;
  filteredCount: number;
  totalCount: number;
  onChange: (next: Partial<AccountFilterState>) => void;
  onClear: () => void;
}

const expiryOptions: FilterOption<ExpiryFilterValue>[] = [
  { value: 'all', label: '全部' },
  { value: 'expired', label: '已过期' },
  { value: 'within-24h', label: '24小时内到期' },
  { value: 'within-7d', label: '7天内到期' },
  { value: 'within-30d', label: '30天内到期' },
  { value: 'missing', label: '未提供到期时间' },
];

const limitOptions: FilterOption<LimitFilterValue>[] = [
  { value: 'all', label: '全部' },
  { value: '0-33', label: '0-33' },
  { value: '33-66', label: '33-66' },
  { value: '66-100', label: '66-100' },
];

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps<T>) {
  return (
    <label className="flex items-center gap-2 shrink-0">
      <span className="text-xs font-medium text-[var(--dash-text-secondary)] shrink-0">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="h-9 min-w-[92px] appearance-none rounded-xl border border-[var(--dash-border)] bg-white pl-3 pr-8 text-sm text-[var(--dash-text-primary)] outline-none transition-colors hover:border-slate-300 focus:border-slate-400"
        >
        {options.map((option) => {
          return (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          );
        })}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </label>
  );
}

export const AccountFilters: React.FC<AccountFiltersProps> = ({
  filters,
  filteredCount,
  totalCount,
  onChange,
  onClear,
}) => {
  const hasActiveFilters = Object.values(filters).some((value) => value !== 'all');

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-[var(--dash-text-muted)] shrink-0">
        {filteredCount} / {totalCount}
      </span>
      <FilterSelect
        label="到期"
        value={filters.expiry}
        options={expiryOptions}
        onChange={(value) => onChange({ expiry: value })}
      />
      <FilterSelect
        label="周限额"
        value={filters.weekly}
        options={limitOptions}
        onChange={(value) => onChange({ weekly: value })}
      />
      <FilterSelect
        label="5h 限额"
        value={filters.hourly}
        options={limitOptions}
        onChange={(value) => onChange({ hourly: value })}
      />
      <button
        type="button"
        onClick={onClear}
        disabled={!hasActiveFilters}
        className="h-9 px-3 rounded-xl border border-[var(--dash-border)] bg-white text-sm text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-slate-300 disabled:opacity-40 disabled:hover:border-[var(--dash-border)]"
      >
        清空
      </button>
    </div>
  );
};

export default AccountFilters;
