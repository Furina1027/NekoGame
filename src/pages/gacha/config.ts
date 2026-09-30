import type { CommonItem } from '@/lib/gacha';

export type GameId = 'genshin' | 'starrail' | 'zzz' | 'miliastra';

export interface PoolRule {
  name: string;
  /** 最高稀有度等级 */
  top: number;
  /** 次高稀有度等级 */
  mid: number;
  /** 最高稀有度保底 */
  topPity: number;
  /** 次高稀有度保底 */
  midPity: number;
  topName: string;
  midName: string;
  /** 评级文案变体 */
  rating: 'default' | 'miliastra';
}

export interface GachaGameConfig {
  id: GameId;
  title: string;
  subtitle: string;
  /** 主题色 token，对应 globals.css 里的 --game-* */
  accent: string;
  /** IPC 通道 */
  channels: {
    uids: string;
    records: string;
    refresh: string;
    lastUid: string;
    exportData: string;
    importData?: string;
    clearUrlCache?: string;
    commonItems: string;
  };
  /** 活动池（存在 UP/歪） */
  upPools: string[];
  poolOrder: string[];
  /** 每个卡池的保底与命名规则；未列出的卡池使用 fallback */
  poolRules: Record<string, PoolRule>;
  fallbackRule: PoolRule;
  /** 稀有度展示文案 */
  qualityLabel: (level: number, rule: PoolRule) => string;
  /** 统计卡片标题 */
  statLabels: { avg: string; up: string; most: string; least: string };
  /** 刷新按钮旁的说明。走米游社 CK 的游戏不需要"先进游戏抽卡界面" */
  refreshHint: string;
  hasImport: boolean;
}

const DEFAULT_RULE: PoolRule = {
  name: '',
  top: 5,
  mid: 4,
  topPity: 90,
  midPity: 10,
  topName: '5星',
  midName: '4星',
  rating: 'default',
};

export const GACHA_GAMES: Record<GameId, GachaGameConfig> = {
  genshin: {
    id: 'genshin',
    title: '原神祈愿分析',
    subtitle: '获取与查看原神抽卡记录',
    accent: 'var(--game-genshin)',
    channels: {
      uids: 'get-genshin-player-uids',
      records: 'get-genshin-gacha-records',
      refresh: 'fetchGenshinGachaData',
      lastUid: 'get-last-genshin-uid',
      exportData: 'export-genshin-data',
      importData: 'import-genshin-data',
      clearUrlCache: 'clear-genshin-url-cache',
      commonItems: 'genshin',
    },
    upPools: ['角色活动祈愿', '武器活动祈愿'],
    poolOrder: ['角色活动祈愿', '武器活动祈愿', '常驻祈愿', '集录祈愿', '新手祈愿'],
    poolRules: {},
    fallbackRule: DEFAULT_RULE,
    qualityLabel: (level) => `${level} 星`,
    statLabels: { avg: '平均5星', up: '平均UP', most: '最非', least: '最欧' },
    refreshHint: '',
    hasImport: true,
  },

  starrail: {
    id: 'starrail',
    title: '崩铁跃迁分析',
    subtitle: '获取与查看崩铁抽卡记录',
    accent: 'var(--game-hsr)',
    channels: {
      uids: 'get-starRail-player-uids',
      records: 'get-starRail-gacha-records',
      refresh: 'fetchStarRailGachaData',
      lastUid: 'get-last-starRail-uid',
      exportData: 'export-starRail-data',
      importData: 'import-starRail-data',
      clearUrlCache: 'clear-starRail-url-cache',
      commonItems: 'starRail',
    },
    upPools: ['角色活动跃迁', '光锥活动跃迁', '角色联动跃迁', '光锥联动跃迁'],
    poolOrder: [
      '角色活动跃迁',
      '光锥活动跃迁',
      '角色联动跃迁',
      '光锥联动跃迁',
      '常驻跃迁',
      '新手跃迁',
    ],
    poolRules: {},
    fallbackRule: DEFAULT_RULE,
    qualityLabel: (level) => `${level} 星`,
    statLabels: { avg: '平均5星', up: '平均UP', most: '最非', least: '最欧' },
    // 崩铁是唯一还需要这句的：它的 genAuthKey 调 getGachaLog 会返回 -100，
    // 实际靠读游戏本地的日志缓存（getStarRailUrl.js:104），必须先进过游戏。
    refreshHint: '刷新数据前请确保至少半小时内打开过游戏抽卡界面',
    hasImport: true,
  },

  zzz: {
    id: 'zzz',
    title: '绝区零频段分析',
    subtitle: '获取与查看绝区零抽卡记录',
    accent: 'var(--game-zzz)',
    channels: {
      uids: 'get-zzz-player-uids',
      records: 'get-zzz-gacha-records',
      refresh: 'fetchZzzGachaData',
      lastUid: 'get-last-zzz-uid',
      exportData: 'export-zzz-data',
      importData: 'import-zzz-data',
      clearUrlCache: 'clear-zzz-url-cache',
      commonItems: 'zzz',
    },
    upPools: ['独家频段', '音擎频段'],
    poolOrder: ['独家频段', '音擎频段', '独家重映', '音擎回响', '常驻频段', '邦布频段'],
    // 绝区零最高稀有度是 S 级（quality_level 4）
    poolRules: {
      独家频段: { name: '独家频段', top: 4, mid: 3, topPity: 90, midPity: 10, topName: 'S 级', midName: 'A 级', rating: 'default' },
      音擎频段: { name: '音擎频段', top: 4, mid: 3, topPity: 90, midPity: 10, topName: 'S 级', midName: 'A 级', rating: 'default' },
    },
    fallbackRule: { ...DEFAULT_RULE, top: 4, mid: 3, topName: 'S 级', midName: 'A 级' },
    qualityLabel: (level) => ['C 级', 'B 级', 'A 级', 'S 级'][level] ?? `${level} 级`,
    statLabels: { avg: '平均S级', up: '平均UP', most: '最非', least: '最欧' },
    refreshHint: '',
    hasImport: true,
  },

  miliastra: {
    id: 'miliastra',
    title: '千星奇域颂愿分析',
    subtitle: '获取与查看千星奇域抽卡记录',
    accent: 'var(--game-miliastra)',
    channels: {
      uids: 'get-miliastra-player-uids',
      records: 'get-miliastra-gacha-records',
      refresh: 'fetchMiliastraGachaData',
      lastUid: 'get-last-miliastra-uid',
      exportData: 'export-miliastra-data',
      commonItems: 'miliastra',
    },
    upPools: ['活动颂愿'],
    poolOrder: ['活动颂愿', '常驻颂愿'],
    poolRules: {
      活动颂愿: { name: '活动颂愿', top: 5, mid: 4, topPity: 70, midPity: 10, topName: '5星', midName: '4星', rating: 'miliastra' },
      常驻颂愿: { name: '常驻颂愿', top: 4, mid: 3, topPity: 70, midPity: 5, topName: '4星', midName: '3星', rating: 'miliastra' },
    },
    fallbackRule: { ...DEFAULT_RULE, topPity: 70, rating: 'miliastra' },
    qualityLabel: (level) => `${level} 星`,
    statLabels: { avg: '平均5星', up: '平均UP', most: '最非', least: '最欧' },
    refreshHint: '',
    hasImport: false,
  },
};

export const GACHA_LIST = Object.values(GACHA_GAMES);

export function isGameId(value: string | undefined): value is GameId {
  return !!value && value in GACHA_GAMES;
}

export function ruleFor(config: GachaGameConfig, pool: string): PoolRule {
  return config.poolRules[pool] ?? { ...config.fallbackRule, name: pool };
}

export type { CommonItem };
