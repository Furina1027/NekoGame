import { useEffect, useState } from 'react';

export interface ThemeColors {
  text: string;
  muted: string;
  grid: string;
  /** 按顺序取用的分类色板 */
  series: string[];
}

const DARK: ThemeColors = {
  text: 'oklch(0.97 0.004 275)',
  muted: 'oklch(0.74 0.015 275)',
  grid: 'oklch(1 0 0 / 0.08)',
  series: [
    'oklch(0.8 0.115 195)',
    'oklch(0.78 0.12 340)',
    'oklch(0.72 0.14 265)',
    'oklch(0.82 0.15 85)',
    'oklch(0.75 0.16 155)',
    'oklch(0.7 0.16 300)',
    'oklch(0.76 0.15 60)',
    'oklch(0.68 0.12 200)',
  ],
};

const LIGHT: ThemeColors = {
  text: 'oklch(0.21 0.015 275)',
  muted: 'oklch(0.52 0.017 275)',
  grid: 'oklch(0.21 0.015 275 / 0.1)',
  series: [
    'oklch(0.62 0.11 200)',
    'oklch(0.68 0.13 340)',
    'oklch(0.7 0.14 265)',
    'oklch(0.76 0.15 85)',
    'oklch(0.68 0.15 155)',
    'oklch(0.7 0.16 300)',
    'oklch(0.76 0.15 60)',
    'oklch(0.68 0.12 200)',
  ],
};

let current = DARK;
const listeners = new Set<(c: ThemeColors) => void>();

export function useTheme() {
  const [colors, setColors] = useState(current);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    listeners.add(setColors);
    return () => {
      listeners.delete(setColors);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = root.classList.contains('dark');
      setIsDark(dark);
      current = dark ? DARK : LIGHT;
      listeners.forEach((fn) => fn(current));
    };
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return { isDark, colors };
}
