/** 抽卡记录（各游戏 IPC 已统一字段名） */
export interface GachaRecord {
  id: string;
  uid: string;
  card_pool_type: string;
  item_id: string;
  count: number;
  timestamp: string;
  name: string;
  lang: string;
  item_type: string;
  quality_level: number;
}

/** 常驻条目：字符串表示永久常驻，对象表示「自加入常驻池后生效」 */
export type CommonItem = string | { name: string; addedTime: string };

function parseTime(value: string | undefined): number {
  if (!value) return Number.NaN;
  return new Date(String(value).replace(' ', 'T')).getTime();
}

/** 该物品在抽卡发生时是否已属于常驻池（即「歪」） */
export function isCommonItem(
  name: string,
  timestamp: string | undefined,
  commonItems: CommonItem[],
): boolean {
  if (!timestamp) return false;
  const pullTime = parseTime(timestamp);
  if (Number.isNaN(pullTime)) return false;
  return commonItems.some((item) => {
    if (typeof item === 'string') return item === name;
    if (item.name !== name) return false;
    const added = parseTime(item.addedTime);
    return Number.isNaN(added) ? true : pullTime >= added;
  });
}

/** 只有活动池才存在 UP/歪之分 */
const DEFAULT_UP_POOLS = [
  '角色活动跃迁',
  '光锥活动跃迁',
  '角色联动跃迁',
  '光锥联动跃迁',
  '武器活动祈愿',
  '角色活动祈愿',
  '独家频段',
  '音擎频段',
];

export function isOffBanner(
  record: GachaRecord,
  commonItems: CommonItem[],
  upPools: string[] = DEFAULT_UP_POOLS,
): boolean {
  if (!upPools.includes(record.card_pool_type)) return false;
  return isCommonItem(record.name, record.timestamp, commonItems);
}

export function groupByPool(records: GachaRecord[]): Record<string, GachaRecord[]> {
  const pools: Record<string, GachaRecord[]> = {};
  for (const r of records) {
    (pools[r.card_pool_type] ??= []).push(r);
  }
  return pools;
}

/**
 * 记录数组是「新 → 旧」倒序的（IPC 按 id DESC 返回）。
 * 以下函数沿用旧版语义：以数组下标差作为「距上一次该稀有度的抽数」。
 */
function gapToNext(marks: GachaRecord[], all: GachaRecord[], index: number): number {
  const next = marks[index + 1];
  if (!next) return all.length;
  return all.indexOf(next);
}

/** 距离上一次抽到指定稀有度已经用了多少抽（还没抽到则为全部） */
export function calculateLastDraws(records: GachaRecord[], quality: number): number {
  const count = records.findIndex((r) => r.quality_level === quality);
  return count === -1 ? records.length : count;
}

/** 最非 / 最欧：相邻两次该稀有度之间的抽数极值 */
export function calculateMostDraws(
  records: GachaRecord[],
  quality: number,
  emptyText: string,
): { maxDraws: number; minDraws: number } | string {
  const marks = records.filter((r) => r.quality_level === quality);
  if (marks.length === 0) return emptyText;

  let maxDraws = 0;
  let minDraws = Number.MAX_VALUE;
  marks.forEach((mark, i) => {
    const draws = gapToNext(marks, records, i) - records.indexOf(mark);
    maxDraws = Math.max(maxDraws, draws);
    minDraws = Math.min(minDraws, draws);
  });
  return { maxDraws, minDraws };
}

/** 平均抽数 */
export function calculateDrawsBetween(
  records: GachaRecord[],
  quality: number,
  emptyText: string,
): number | string {
  const marks = records.filter((r) => r.quality_level === quality);
  if (marks.length === 0) return emptyText;
  let total = 0;
  marks.forEach((mark, i) => {
    total += gapToNext(marks, records, i) - records.indexOf(mark);
  });
  return total / marks.length;
}

/** 平均 UP 抽数（仅活动池） */
export function calculateUpAverage(
  records: GachaRecord[],
  commonItems: CommonItem[],
  topQuality: number,
  upPools: string[],
): number | string {
  const upRecords = records.filter(
    (r) =>
      r.quality_level === topQuality &&
      !isCommonItem(r.name, r.timestamp, commonItems) &&
      upPools.includes(r.card_pool_type),
  );
  if (upRecords.length === 0) return '还没抽出UP';
  let total = 0;
  upRecords.forEach((r, i) => {
    total += gapToNext(upRecords, records, i) - records.indexOf(r);
  });
  return total / upRecords.length;
}

/** 不歪概率：UP 之后紧接着还是 UP 的比例 */
export function calculateNoDeviationRate(
  records: GachaRecord[],
  commonItems: CommonItem[],
  topQuality: number,
): string {
  const top = records.filter((r) => r.quality_level === topQuality);
  if (top.length === 0) return '无数据';

  const isUp = (r?: GachaRecord) => (r ? !isCommonItem(r.name, r.timestamp, commonItems) : false);
  let upCount = 0;
  let noDeviation = 0;
  top.forEach((record, i) => {
    if (!isUp(record)) return;
    upCount++;
    if (i === 0 || isUp(top[i - 1])) noDeviation++;
  });

  if (upCount === 0) return '还没抽出UP';
  return `${((noDeviation / upCount) * 100).toFixed(2)}%`;
}

/* ------------------------------------------------------------------ 评级 */

const RATING_NO_UP = [
  [15, '万里挑一至尊欧皇'],
  [30, '万里挑一欧皇'],
  [55, '尊贵欧皇'],
  [60, '薛定谔的欧皇'],
  [68, '欧非守恒'],
  [71, '薛定谔的非酋'],
  [73, '绝世非酋'],
  [75, '万里挑一非酋'],
] as const;

const RATING_MILIATRA_NO_UP = [
  [15, '万里挑一至尊欧皇'],
  [30, '万里挑一欧皇'],
  [45, '尊贵欧皇'],
  [53, '薛定谔的欧皇'],
  [60, '欧非守恒'],
  [63, '薛定谔的非酋'],
  [66, '绝世非酋'],
  [68, '万里挑一非酋'],
] as const;

const RATING_UP = [
  [20, '万里挑一至臻欧皇'],
  [35, '万里挑一至尊欧皇'],
  [45, '万里挑一欧皇'],
  [55, '至臻欧皇'],
  [75, '至尊欧皇'],
  [85, '薛定谔的欧皇'],
  [95, '欧非守恒'],
  [115, '薛定谔的非酋'],
  [125, '绝世非酋'],
  [135, '万里挑一非酋'],
] as const;

const LAST = '万里挑一绝世非酋';

function lookup(table: readonly (readonly [number, string])[], value: number): string {
  for (const [limit, label] of table) if (value <= limit) return label;
  return LAST;
}

export function getRating(
  avg: number | string,
  avgUp: number | string | null,
  variant: 'default' | 'miliastra' = 'default',
): string {
  if (typeof avg !== 'number') return '无数据';
  if (typeof avgUp !== 'number') {
    return lookup(variant === 'miliastra' ? RATING_MILIATRA_NO_UP : RATING_NO_UP, avg);
  }
  return lookup(RATING_UP, avgUp);
}

/* ------------------------------------------------------------ 抽数配色 */

export function getDrawColor(
  draws: number,
  quality: number,
  topQuality: number,
  midQuality: number,
): string {
  const [good, mid] =
    quality === topQuality ? [35, 67] : quality === midQuality ? [3, 7] : [10, 25];
  if (draws <= good) return 'oklch(0.78 0.13 235)';
  if (draws <= mid) return 'oklch(0.78 0.15 155)';
  return 'oklch(0.68 0.19 22)';
}

/* -------------------------------------------------------------- 分组 */

export function groupByDate<T extends GachaRecord>(records: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const date = (r.timestamp ?? '').split(' ')[0] || '未知日期';
    const bucket = groups.get(date);
    if (bucket) bucket.push(r);
    else groups.set(date, [r]);
  }
  return [...groups.entries()];
}

/** 为每条记录补上「距上一次同稀有度的抽数」 */
export function annotateDraws(
  records: GachaRecord[],
  topQuality: number,
  midQuality: number,
  commonItems: CommonItem[],
  upPools: string[],
): (GachaRecord & { draws: number | null; offBanner: boolean })[] {
  const topMarks = records.filter((r) => r.quality_level === topQuality);
  const midMarks = records.filter((r) => r.quality_level === midQuality);

  return records.map((record) => {
    const idx = records.indexOf(record);
    let draws: number | null = null;
    if (record.quality_level === topQuality) {
      const nextIdx = topMarks.findIndex((r) => records.indexOf(r) > idx);
      draws = nextIdx === -1 ? records.length - idx : records.indexOf(topMarks[nextIdx]) - idx;
    } else if (record.quality_level === midQuality) {
      const nextIdx = midMarks.findIndex((r) => records.indexOf(r) > idx);
      draws = nextIdx === -1 ? records.length - idx : records.indexOf(midMarks[nextIdx]) - idx;
    }
    return {
      ...record,
      draws,
      offBanner: isOffBanner(record, commonItems, upPools),
    };
  });
}
