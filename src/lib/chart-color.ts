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

/** 分类色的描边与面板底色一致，避免饼图上生硬的黑圈（各处硬编码的深色描边曾互不一致） */
export function seriesBorderColor(): string {
  return resolveCssColor('--card', 'oklch(0.2 0.016 275)');
}

/** oklch(…) 颜色追加透明度，用于给主题系列色做面积填充 */
export function withAlpha(color: string, alpha: number): string {
  return color.includes('/') ? color : color.replace(/\)$/, ` / ${alpha})`);
}

/**
 * 每个游戏一个固定颜色：柱状分布、环形占比、多线趋势里同一个游戏
 * 必须同色，否则用户没法把「趋势里的蓝线」对应到「占比里的粉扇形」。
 * 用名字哈希在调色板里占位并解决冲突，与图例顺序无关，跨图表稳定。
 */
const GAME_PALETTE = [
  'oklch(0.8 0.115 195)',
  'oklch(0.78 0.12 340)',
  'oklch(0.72 0.14 265)',
  'oklch(0.82 0.15 85)',
  'oklch(0.75 0.16 155)',
  'oklch(0.7 0.16 300)',
  'oklch(0.76 0.15 60)',
  'oklch(0.68 0.12 200)',
];

const gameColorCache = new Map<string, string>();

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function gameColor(name: string): string {
  const cached = gameColorCache.get(name);
  if (cached) return cached;
  const used = new Set(gameColorCache.values());
  let idx = hashName(name) % GAME_PALETTE.length;
  while (used.has(GAME_PALETTE[idx])) idx = (idx + 1) % GAME_PALETTE.length;
  gameColorCache.set(name, GAME_PALETTE[idx]);
  return GAME_PALETTE[idx];
}
