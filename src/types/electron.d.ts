import type {
  AnalysisResult,
  AnalysisType,
  BackgroundSettings,
  Game,
  GameDataInput,
  GameDetails,
  DailyTimePoint,
  LeaderboardEntry,
  LogEntry,
  RunningStatus,
  TrendPoint,
} from './domain';

export interface ElectronAPI {
  /* 窗口 */
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  isMaximized(): Promise<boolean>;
  onMaximizedChanged(cb: (maximized: boolean) => void): () => void;

  /* 游戏库 */
  loadGames(): Promise<Game[]>;
  addGame(game: GameDataInput): Promise<number>;
  updateGame(game: GameDataInput): Promise<void>;
  deleteGame(gameId: number): Promise<void>;
  getGameDetails(gameId: number): Promise<GameDetails>;
  getGameTrendData(gameId: number): Promise<TrendPoint[]>;
  getGameDailyTimeData(gameId: number): Promise<DailyTimePoint[]>;
  getGameTimeData(): Promise<Game[]>;
  launchGame(gamePath: string): Promise<void>;
  onGameDataUpdated(cb: (data: unknown) => void): () => void;
  onRunningStatusUpdated(cb: (status: RunningStatus) => void): () => void;

  /* 文件选择 */
  openFile(): Promise<string | null>;
  selectImageFile(): Promise<string | null>;
  filePathToURL(filePath: string | null | undefined): string;

  /* 首页统计 */
  getAnalysisData<T extends AnalysisType>(
    type: T,
    range?: string,
  ): Promise<AnalysisResult<T>>;
  refreshAnalysisData<T extends AnalysisType>(type: T): Promise<AnalysisResult<T>>;
  getLeaderboardData(): Promise<LeaderboardEntry[]>;
  getLogData(page: number): Promise<LogEntry[]>;

  /* 设置 */
  setAutoLaunch(enabled: boolean): Promise<void>;
  checkErrors(): Promise<unknown>;
  saveBackgroundSettings(key: string, value: string): Promise<unknown>;
  loadBackgroundSettings(): Promise<Record<string, string | null>>;
  selectBackgroundFile(): Promise<{ canceled: boolean; filePaths: string[] }>;
  restoreDefaultBackgroundSettings(): Promise<unknown>;
  onBackgroundSettings(cb: (settings: BackgroundSettings) => void): () => void;
  onGachaRecordsStatus(cb: (status: string) => void): () => void;
  browseDataFile(): Promise<{ success: boolean; path?: string; message?: string }>;
  resetDataFile(): Promise<{ success: boolean; path?: string; message?: string }>;
  getDataFilePath(): Promise<{ path: string }>;

  /* 通用 */
  openDataPath(path: string): void;
  openExternal(url: string): void;
  on(channel: string, listener: (...args: never[]) => void): () => void;
  send(channel: string, data?: unknown): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
