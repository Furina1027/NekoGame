import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackgroundSettings } from '@/types/domain';

export type BackgroundStyle = 'heavy' | 'light' | 'floating' | 'solid-sidebar';

export const BACKGROUND_STYLES: {
  id: BackgroundStyle;
  name: string;
  desc: string;
}[] = [
  { id: 'heavy', name: '重度遮罩', desc: '文字最清晰，壁纸只留一点轮廓' },
  { id: 'light', name: '轻透', desc: '壁纸明显可见，面板更实来补足对比' },
  { id: 'floating', name: '悬浮卡片', desc: '遮罩最轻，壁纸几乎原样露出，卡片自己带底' },
  { id: 'solid-sidebar', name: '实心侧栏', desc: '左侧不透明，右侧透出壁纸，层次最分明' },
];

const STYLE_KEY = 'nekogame:bg-style';

const DEFAULT_SETTINGS: BackgroundSettings = {
  backgroundImage: null,
  backgroundOpacity: 0.45,
};

function readStyle(): BackgroundStyle {
  const raw = localStorage.getItem(STYLE_KEY);
  return BACKGROUND_STYLES.some((s) => s.id === raw) ? (raw as BackgroundStyle) : 'heavy';
}

function applyStyle(value: BackgroundStyle) {
  document.documentElement.dataset.bgStyle = value;
}

let current: BackgroundSettings = DEFAULT_SETTINGS;
let currentStyle: BackgroundStyle = readStyle();
const listeners = new Set<(s: BackgroundSettings) => void>();
const styleListeners = new Set<(v: BackgroundStyle) => void>();

function apply(next: BackgroundSettings) {
  current = next;
  listeners.forEach((fn) => fn(next));
}

export function useBackground() {
  const [settings, setSettings] = useState<BackgroundSettings>(current);
  const [style, setStyleState] = useState<BackgroundStyle>(currentStyle);

  useEffect(() => {
    listeners.add(setSettings);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);

  useEffect(() => {
    styleListeners.add(setStyleState);
    return () => {
      styleListeners.delete(setStyleState);
    };
  }, []);

  useEffect(() => {
    applyStyle(currentStyle);
    let cancelled = false;
    window.electronAPI
      .loadBackgroundSettings()
      .then((raw) => {
        if (cancelled) return;
        apply({
          backgroundImage: raw.backgroundImage || null,
          backgroundOpacity: Number(raw.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity),
        });
      })
      .catch(() => {});
    return window.electronAPI.onBackgroundSettings((next) => apply(next));
  }, []);

  const fileUrl = (filePath: string | null) =>
    filePath ? window.electronAPI.filePathToURL(filePath) : '';

  /**
   * 拖动滑块时先只更新界面，停止拖动 300ms 后再落盘，
   * 否则一次拖动会产生上百次 SQLite 写入。
   */
  const persistTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    [],
  );

  const persist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      const entries: [string, string][] = [
        ['backgroundImage', current.backgroundImage ?? ''],
        ['backgroundOpacity', String(current.backgroundOpacity)],
      ];
      void Promise.all(
        entries.map(([k, v]) => window.electronAPI.saveBackgroundSettings(k, v)),
      );
    }, 300);
  }, []);

  const update = useCallback(
    (patch: Partial<BackgroundSettings>) => {
      apply({ ...current, ...patch });
      persist();
    },
    [persist],
  );

  const setStyle = useCallback((next: BackgroundStyle) => {
    currentStyle = next;
    localStorage.setItem(STYLE_KEY, next);
    applyStyle(next);
    styleListeners.forEach((fn) => fn(next));
  }, []);

  const restoreDefault = useCallback(async () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = null;
    await window.electronAPI.restoreDefaultBackgroundSettings();
    apply(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    style,
    setStyle,
    imageUrl: fileUrl(settings.backgroundImage),
    update,
    restoreDefault,
  };
}
