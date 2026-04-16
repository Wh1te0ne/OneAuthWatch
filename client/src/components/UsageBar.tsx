import React from 'react';

interface UsageBarProps {
  label: string;
  percentLeft: number;
  resetTime?: string;
  showLabel?: boolean;
}

const getBarColor = (percent: number): string => {
  if (percent >= 50) return 'bg-[var(--dash-meter-good)]';
  if (percent >= 25) return 'bg-[var(--dash-meter-warn)]';
  return 'bg-[var(--dash-meter-bad)]';
};

export const UsageBar: React.FC<UsageBarProps> = ({ 
  label, 
  percentLeft, 
  resetTime,
  showLabel = true 
}) => {
  const barColor = getBarColor(percentLeft);
  
  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-xs">
          <span className="text-[var(--dash-text-secondary)]">{label}</span>
          <span className="text-[var(--dash-text-secondary)]">
            {percentLeft}% 剩余
            {resetTime && <span className="text-[var(--dash-text-muted)] ml-2">重置于 {resetTime}</span>}
          </span>
        </div>
      )}
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${barColor} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${percentLeft}%` }}
        />
      </div>
    </div>
  );
};

export default UsageBar;
