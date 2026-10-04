/** 游戏库中的一条记录。icon / poster_* 实际存的是图片文件路径。 */
export interface Game {
  id: number;
  name: string;
  path: string;
  icon: string | null;
  poster_vertical: string | null;
  poster_horizontal: string | null;
  total_time: number;
  /** 今日游玩秒数，仅 getGameTimeData / loadGames 返回 */
  today_time?: number;
  /** 近两周游玩秒数 */
  two_weeks_time?: number;
}

export interface GameDetails {
  name: string;
  icon: string | null;
  poster_horizontal: string | null;
  poster_vertical: string | null;
  path: string;
  total_time: number;
  last_played: string | null;
  rank: number | '--';
  avg_daily_time: number | null;
}

export interface DailyTimePoint {
  date: string;
  total_time: number;
}

export interface TrendPoint {
  date: string;
  total_time: number;
}

export interface LeaderboardEntry {
  name: string;
  icon: string | null;
  poster_horizontal: string | null;
  end_time: string | null;
  total_time: number;
}

export interface LogEntry {
  id: number;
  game_id: number;
  game_name: string;
  icon: string | null;
  poster_horizontal: string | null;
  start_time: string;
  end_time: string | null;
  duration: number | null;
  path?: string;
}

export interface GameDataInput {
  id?: number;
  name: string;
  icon: string | null;
  poster_vertical: string | null;
  poster_horizontal: string | null;
  path: string;
}

/* ---------------------------------------------------------------- 首页统计 */

export type AnalysisType =
  | 'today_total_time'
  | 'yesterday_total_time'
  | 'weekly_game_time'
  | 'monthly_trend'
  | 'half_year_distribution'
  | 'total_time_distribution';

export interface TodayTotalTime {
  total_time_today: number;
}
export interface YesterdayTotalTime {
  total_time_yesterday: number;
}
export interface NamedTimePoint {
  game_name: string;
  date?: string;
  total_time: number;
}

export interface AnalysisDataMap {
  today_total_time: TodayTotalTime;
  yesterday_total_time: YesterdayTotalTime;
  weekly_game_time: NamedTimePoint[];
  monthly_trend: TrendPoint[];
  half_year_distribution: NamedTimePoint[];
  total_time_distribution: NamedTimePoint[];
}

export interface AnalysisResult<T extends AnalysisType = AnalysisType> {
  data: AnalysisDataMap[T];
  updatedAt: string;
}

export type TrendRange = 'week' | 'month' | 'six_months';
export type TrendGranularity = 'daily' | 'monthly';

/* ------------------------------------------------------------------ 运行态 */

/** 主进程 gameTracker 每 15 秒广播的运行状态负载 */
export interface RunningGame {
  id: number;
  isRunning: boolean;
}

/* ------------------------------------------------------------------ 背景 */

export interface BackgroundSettings {
  backgroundImage: string | null;
  backgroundOpacity: number;
}
