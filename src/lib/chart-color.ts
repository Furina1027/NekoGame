/**
 * Chart.js 的颜色是直接交给 canvas 的 fillStyle / strokeStyle 的，
 * canvas 不认 CSS 自定义属性：传 'var(--gacha-5)' 会被判为非法颜色，
 * 静默沿用上一次的值，初始就是黑色（表现为整块图表全黑）。
 * 所以凡是进图表的数据都要先在这里把变量解析成真实色值。
 */
export function resolveCssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}
