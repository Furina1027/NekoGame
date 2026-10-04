export interface ThemeColors {
  text: string;
  muted: string;
  grid: string;
  /** 按顺序取用的分类色板 */
  series: string[];
}

/**
 * 应用固定使用深色主题（index.html 硬编码 class="dark"，globals.css 里
 * 遮罩/模糊等关键变量只定义了深色一套）。之前这里还保留了一套从未启用的
 * 浅色配色和每组件实例一个的 MutationObserver——永远观察不到变化，纯开销。
 * 现在只留深色值，引用恒定，依赖 colors 的 useMemo 也不会再失效。
 */
const current: ThemeColors = {
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

export function useTheme() {
  return { isDark: true, colors: current };
}
