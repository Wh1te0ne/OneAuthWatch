import React, { useState, useEffect } from 'react';
import type { AppConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  config: AppConfig;
  onClose: () => void;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
}) => {
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(config.autoRefreshInterval);
  const [closeBehavior, setCloseBehavior] = useState(config.closeBehavior);
  const [serverUrl, setServerUrl] = useState(config.serverUrl || '');
  const [serverToken, setServerToken] = useState(config.serverToken || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAutoRefreshInterval(config.autoRefreshInterval);
    setCloseBehavior(config.closeBehavior);
    setServerUrl(config.serverUrl || '');
    setServerToken(config.serverToken || '');
  }, [isOpen, config.autoRefreshInterval, config.closeBehavior, config.serverUrl, config.serverToken]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const normalizedAutoRefreshInterval =
      autoRefreshInterval <= 0 ? 0 : Math.max(1, Math.round(autoRefreshInterval));

    setIsSaving(true);
    try {
      await onSave({
        autoRefreshInterval: normalizedAutoRefreshInterval,
        closeBehavior,
        serverUrl,
        serverToken,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-950/20 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 border border-[var(--dash-border)] shadow-[0_20px_48px_rgba(17,24,39,0.12)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-[var(--dash-text-primary)]">设置</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-[var(--dash-text-muted)] hover:text-[var(--dash-text-primary)] hover:bg-stone-100 rounded-full transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* 自动刷新间隔 */}
          <div>
            <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-2">
              自动刷新间隔
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="flex-1 h-1 bg-stone-200 rounded appearance-none cursor-pointer accent-[var(--dash-accent)]"
              />
              <span className="text-[var(--dash-text-primary)] text-sm w-16 text-right tabular-nums">
                {autoRefreshInterval === 0 ? '禁用' : `${autoRefreshInterval} 分钟`}
              </span>
            </div>
            <p className="text-xs text-[var(--dash-text-muted)] mt-2">
              设置为 0 禁用自动刷新；启用后最小为 1 分钟
            </p>
          </div>

          <div className="pt-4 border-t border-stone-200 space-y-3">
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-2">
                点击关闭按钮时
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'ask', label: '每次询问' },
                  { value: 'tray', label: '最小化到托盘' },
                  { value: 'exit', label: '直接退出' },
                ].map((option) => {
                  const selected = closeBehavior === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCloseBehavior(option.value as AppConfig['closeBehavior'])}
                      className={`h-10 rounded-xl border text-sm transition-colors ${
                        selected
                          ? 'border-[var(--dash-accent)] bg-stone-50 text-[var(--dash-text-primary)]'
                          : 'border-[var(--dash-border)] bg-white text-[var(--dash-text-secondary)] hover:text-[var(--dash-text-primary)] hover:border-stone-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--dash-text-muted)] mt-1">
                选择“每次询问”后，点击右上角关闭按钮时会再次弹出操作选择
              </p>
            </div>
          </div>

          {/* 服务器配置 */}
          <div className="pt-4 border-t border-stone-200 space-y-3">
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                同步服务器地址
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:9211"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-stone-400 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[var(--dash-text-secondary)] text-xs font-medium mb-1.5">
                同步口令（当前未启用）
              </label>
              <input
                type="password"
                value={serverToken || ''}
                onChange={(e) => setServerToken(e.target.value)}
                placeholder="当前版本无需填写"
                className="w-full h-10 px-3 bg-white border border-[var(--dash-border)] rounded-xl text-sm text-[var(--dash-text-primary)] placeholder-[var(--dash-text-muted)] focus:border-stone-400 outline-none transition-colors"
              />
              <p className="text-xs text-[var(--dash-text-muted)] mt-1">
                当前同步链路不要求密码认证，保留该字段仅为后续扩展兼容
              </p>
            </div>
          </div>

          {/* 关于 */}
          <div className="pt-4 border-t border-stone-200">
            <h3 className="text-[var(--dash-text-secondary)] text-xs font-medium mb-2">关于</h3>
            <div className="space-y-1 text-sm text-[var(--dash-text-secondary)]">
              <p>OneAuthWatch v0.1.0</p>
              <p className="text-xs text-[var(--dash-text-muted)]">
                OneAuthWatch 本地桌面端
              </p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-stone-100 hover:bg-stone-200 text-[var(--dash-text-primary)] rounded-xl text-sm transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 h-10 bg-[var(--dash-accent)] hover:opacity-90 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
