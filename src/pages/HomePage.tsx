import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  RefreshCw,
  Trophy,
  ScrollText,
  LayoutDashboard,
  Layers,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { PageHeader, StatCard, EmptyState } from '@/components/common/Primitives';
import { ChartCard } from '@/components/chart/ChartCard';
import { Chart } from '@/components/chart/Chart';
import { ContributionHeatmap } from '@/components/library/ContributionHeatmap';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { formatDuration, formatHours, fromNow } from '@/lib/format';
import { useToast } from '@/hooks/useToast';
import type { DailyTimePoint, Game, LogEntry, NamedTimePoint, TrendPoint } from '@/types/domain';

const ALL_TYPES = [
  'today_total_time',
  'yesterday_total_time',
  'weekly_game_time',
  'monthly_trend',
  'half_year_distribution',
  'total_time_distribution',
] as const;

const LOG_PAGE_SIZE = 20;
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/**
 * 各游戏的时长数据放在模块级缓存里，不随组件卸载丢。
 * 切换游戏会卸载/挂载面板，若数据只存在 useState 里，来回切每次都要等 IPC 回来，
 * 图表会先空一帧再画出来——看起来就是「图表不见了」。
 * 命中缓存时首帧就带数据，之后再静默刷新。
 */
const dailyCache = new Map<number, DailyTimePoint[]>();
const trendCache = new Map<number, TrendPoint[]>();
let allGamesCache: {
  today: number; yesterday: number; updatedAt: string;
  weekly: NamedTimePoint[]; monthly: TrendPoint[]; halfYear: NamedTimePoint[]; distribution: NamedTimePoint[];
} | null = null;

/** null 表示查看全部游戏 */
type GameFilter = number | null;

export default function HomePage() {
  const [tab, setTab] = useState('overview');
  const [games, setGames] = useState<Game[]>([]);
  const [filter, setFilter] = useState<GameFilter>(null);
  const [running, setRunning] = useState<Set<number>>(new Set());

  useEffect(() => {
    window.electronAPI.send('request-running-status');
    const off = window.electronAPI.onRunningStatusUpdated((status) => {
      const list = Array.isArray(status) ? status : (status?.games ?? []);
      setRunning(new Set(list.filter((g) => g.isRunning).map((g) => g.id)));
    });
    window.electronAPI
      .getGameTimeData()
      .then((rows) => setGames(rows))
      .catch(() => {});
    return off;
  }, []);

  // 当前选中的游戏；被删除后回落到「全部」
  const active = useMemo(
    () => (filter === null ? null : (games.find((g) => g.id === filter) ?? null)),
    [filter, games],
  );

  // 预热各游戏的时长数据。
  // 不预热的话，缓存里只有「全部游戏」和已经点过的游戏：首次点某个游戏时
  // 图表只能空建，等 IPC 回来才 update() 出动画，中间有一段空窗——
  // 表现出来就是「全部游戏 -> 具体游戏」比反向切换卡一下。
  useEffect(() => {
    const pending = games.map((g) => g.id).filter((id) => !dailyCache.has(id));
    if (pending.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const id of pending) {
        if (cancelled) return;
        const [d, t] = await Promise.all([
          window.electronAPI.getGameDailyTimeData(id).catch(() => []),
          window.electronAPI.getGameTrendData(id).catch(() => []),
        ]);
        if (!dailyCache.has(id)) {
          dailyCache.set(id, Array.isArray(d) ? d : []);
          trendCache.set(id, Array.isArray(t) ? t : []);
        }
        // 逐个来，别和用户正在做的操作抢数据库
        await new Promise((r) => window.setTimeout(r, 150));
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [games]);

  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <PageHeader
        title="主页"
        description={active ? `正在查看「${active.name}」的时长数据` : '今日概况、游戏时长趋势与游玩记录'}
      />

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard />
            概况
          </TabsTrigger>
          <TabsTrigger value="leaderboard">
            <Trophy />
            排行榜
          </TabsTrigger>
          <TabsTrigger value="log">
            <ScrollText />
            日志
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="min-h-0">
          <div className="grid gap-5 xl:grid-cols-[264px_1fr]">
            <GameRail
              games={games}
              running={running}
              activeId={filter}
              onSelect={setFilter}
            />
            <OverviewTab filter={active} />
          </div>
        </TabsContent>

        <TabsContent value="leaderboard">
          <LeaderboardTab />
        </TabsContent>

        <TabsContent value="log">
          <LogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------------------------------------- 游戏列表 */

function GameRail({
  games,
  running,
  activeId,
  onSelect,
}: {
  games: Game[];
  running: Set<number>;
  activeId: GameFilter;
  onSelect: (id: GameFilter) => void;
}) {
  if (games.length === 0) {
    return (
      <EmptyState
        icon={Layers}
          title="还没有游戏"
          description="前往「游戏库」添加你的第一款游戏，即可开始记录时长。"
      />
    );
  }

  const maxToday = Math.max(...games.map((g) => g.today_time ?? 0), 1);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-medium text-muted-foreground">游戏列表</h2>

      {/* 全部 */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-200',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          activeId === null
            ? 'border-primary/50 bg-surface-raised font-medium'
            : 'border-border hover:bg-accent/50',
        )}
      >
        <Layers className="size-4 shrink-0 text-primary" />
        全部游戏
        <span className="ml-auto tabular-nums text-xs text-muted-foreground">
          {formatHours(games.reduce((s, g) => s + g.total_time, 0))}
        </span>
      </button>

      {games.map((game) => {
        const isRunning = running.has(game.id);
        const isActive = game.id === activeId;
        const today = game.today_time ?? 0;
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => onSelect(isActive ? null : game.id)}
            title={`${game.name} · 累计 ${formatHours(game.total_time)}`}
            className={cn(
              'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-2.5 text-left',
              'transition-all duration-200 ease-[var(--ease-out-expo)]',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isActive
                ? 'border-primary/50 bg-surface-raised'
                : 'border-border hover:-translate-y-0.5 hover:bg-surface-raised',
            )}
          >
            {game.poster_vertical && (
              <img
                src={window.electronAPI.filePathToURL(game.poster_vertical)}
                alt=""
                className="h-16 w-11 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{game.name}</span>
                {isRunning && <Badge variant="success">运行中</Badge>}
              </div>
              <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>今日</dt>
                  <dd className="tabular-nums text-foreground/90">{formatHours(today)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>两周</dt>
                  <dd className="tabular-nums text-foreground/90">
                    {formatHours(game.two_weeks_time ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>总计</dt>
                  <dd className="tabular-nums text-foreground/90">
                    {formatHours(game.total_time)}
                  </dd>
                </div>
              </dl>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-expo)]',
                    isRunning ? 'bg-primary' : 'bg-muted-foreground/40',
                  )}
                  style={{ width: `${Math.min(100, (today / maxToday) * 100)}%` }}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- 概况 */

type Range = 'week' | 'month' | 'six_months';

function OverviewTab({ filter }: { filter: Game | null }) {
  return filter ? <SingleGamePanel game={filter} /> : <AllGamesPanel />;
}

/* ---- 全部游戏 ---- */

function AllGamesPanel() {
  const { colors } = useTheme();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>(allGamesCache?.updatedAt ?? '');
  const [todaySeconds, setTodaySeconds] = useState(allGamesCache?.today ?? 0);
  const [yesterdaySeconds, setYesterdaySeconds] = useState(allGamesCache?.yesterday ?? 0);

  const [weekly, setWeekly] = useState<NamedTimePoint[]>(allGamesCache?.weekly ?? []);
  const [monthly, setMonthly] = useState<TrendPoint[]>(allGamesCache?.monthly ?? []);
  const [halfYear, setHalfYear] = useState<NamedTimePoint[]>(allGamesCache?.halfYear ?? []);
  const [distribution, setDistribution] = useState<NamedTimePoint[]>(allGamesCache?.distribution ?? []);

  const [swapSeq, setSwapSeq] = useState(0);
  const [weeklyRange, setWeeklyRange] = useState<Range>('week');
  const [monthlyRange, setMonthlyRange] = useState<Range>('month');
  const [halfYearGranularity, setHalfYearGranularity] = useState<'daily' | 'monthly'>('daily');

  const load = useCallback(async () => {
    try {
      const [today, yesterday, w, m, h, d] = await Promise.all([
        window.electronAPI.getAnalysisData('today_total_time'),
        window.electronAPI.getAnalysisData('yesterday_total_time'),
        window.electronAPI.getAnalysisData('weekly_game_time'),
        window.electronAPI.getAnalysisData('monthly_trend'),
        window.electronAPI.getAnalysisData('half_year_distribution'),
        window.electronAPI.getAnalysisData('total_time_distribution'),
      ]);
      setTodaySeconds(today.data.total_time_today ?? 0);
      setYesterdaySeconds(yesterday.data.total_time_yesterday ?? 0);
      setUpdatedAt(today.updatedAt);
      setWeekly(Array.isArray(w.data) ? w.data : []);
      setMonthly(Array.isArray(m.data) ? m.data : []);
      setHalfYear(Array.isArray(h.data) ? h.data : []);
      setDistribution(Array.isArray(d.data) ? d.data : []);
      allGamesCache = {
        today: today.data.total_time_today ?? 0,
        yesterday: yesterday.data.total_time_yesterday ?? 0,
        updatedAt: today.updatedAt,
        weekly: Array.isArray(w.data) ? w.data : [],
        monthly: Array.isArray(m.data) ? m.data : [],
        halfYear: Array.isArray(h.data) ? h.data : [],
        distribution: Array.isArray(d.data) ? d.data : [],
      };
    } catch {
      /* 主进程不可用时保持空态 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(ALL_TYPES.map((t) => window.electronAPI.refreshAnalysisData(t)));
      await load();
      // 汇总数据重算后往往与原值一致（时长只在游戏会话结束时变化），
      // 光看界面几乎没有变化，不给反馈会被当成按钮坏了。
      setSwapSeq((n) => n + 1);
      toast.success('数据已刷新');
    } catch (err) {
      toast.error('刷新失败', err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [load, toast]);

  const weeklyChart = useMemo(() => {
    const byGame = new Map<string, number>();
    for (const item of weekly) {
      byGame.set(item.game_name, (byGame.get(item.game_name) ?? 0) + item.total_time);
    }
    const entries = [...byGame.entries()].sort((a, b) => b[1] - a[1]);
    return { labels: entries.map(([k]) => k), values: entries.map(([, v]) => v / 3600) };
  }, [weekly]);

  const monthlyChart = useMemo(() => {
    const buckets = new Map<string, number>();
    if (monthlyRange === 'six_months') {
      for (let i = 5; i >= 0; i--) {
        buckets.set(dayjs().subtract(i, 'month').format('YYYY-MM'), 0);
      }
      for (const p of monthly) {
        const key = p.date.slice(0, 7);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + p.total_time / 3600);
      }
    } else {
      for (let i = 29; i >= 0; i--) {
        buckets.set(dayjs().subtract(i, 'day').format('YYYY-MM-DD'), 0);
      }
      for (const p of monthly) {
        const key = p.date.slice(0, 10);
        if (buckets.has(key)) buckets.set(key, p.total_time / 3600);
      }
    }
    const values = [...buckets.values()];
    const nonZero = values.filter((v) => v > 0);
    const average = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    return { labels: [...buckets.keys()], values, average };
  }, [monthly, monthlyRange]);

  const halfYearChart = useMemo(() => {
    const key = (d: string) => (halfYearGranularity === 'daily' ? d : d.slice(0, 7));
    const allKeys = [...new Set(halfYear.map((p) => key(p.date ?? '')))].sort();
    const labels = allKeys.slice(halfYearGranularity === 'daily' ? -30 : -6);
    const games = [...new Set(halfYear.map((p) => p.game_name))].slice(0, 6);
    const datasets = games.map((game) => ({
      label: game,
      data: labels.map((l) =>
        halfYear
          .filter((p) => p.game_name === game && key(p.date ?? '') === l)
          .reduce((sum, p) => sum + p.total_time / 3600, 0),
      ),
    }));
    return { labels, datasets };
  }, [halfYear, halfYearGranularity]);

  const distributionChart = useMemo(
    () => ({
      labels: distribution.map((p) => p.game_name),
      values: distribution.map((p) => p.total_time / 3600),
    }),
    [distribution],
  );

  const axis = useChartAxis(colors);
  const tooltipStyle = useChartTooltip(colors);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="今日总时长"
          value={formatDuration(todaySeconds)}
          icon={Flame}
          tone="primary"
        />
        <StatCard
          label="昨日总时长"
          value={formatDuration(yesterdaySeconds)}
          hint="与今日对比回看"
        />
        <StatCard
          label="数据更新时间"
          value={<span className="text-lg">{updatedAt ? updatedAt.slice(11, 16) : '--:--'}</span>}
          hint={updatedAt ? updatedAt.slice(0, 10) : '尚未刷新'}
        />
        <div className="flex items-end">
          <Button onClick={refresh} disabled={refreshing} variant="secondary" size="sm">
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
            刷新数据
          </Button>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <ChartCard
          title="游戏总时长趋势"
          description="每天的总游玩时长，虚线为有记录日子的平均值"
          action={
            <RangeSelect
              value={monthlyRange}
              onChange={(v) => setMonthlyRange(v as Range)}
              options={[
                ['month', '近 30 天'],
                ['six_months', '近六个月'],
              ]}
            />
          }
        >
          <Chart
            swapKey={swapSeq}
            type="line"
            height={240}
            data={{
              labels: monthlyChart.labels.map((l) => l.slice(5)),
              datasets: [
                {
                  label: '总时长',
                  data: monthlyChart.values,
                  borderColor: colors.series[0],
                  backgroundColor: 'oklch(0.8 0.115 195 / 0.14)',
                  fill: true,
                  tension: 0.35,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  borderWidth: 2,
                },
                {
                  label: `平均 ${monthlyChart.average.toFixed(1)} 小时`,
                  data: monthlyChart.values.map(() => monthlyChart.average),
                  borderColor: 'oklch(0.78 0.12 340 / 0.7)',
                  borderDash: [5, 5],
                  pointRadius: 0,
                  borderWidth: 1.5,
                  fill: false,
                },
              ],
            }}
            options={{
              scales: { x: axis, y: { ...axis, beginAtZero: true } },
              plugins: {
                legend: { display: false },
                tooltip: {
                  ...tooltipStyle,
                  callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)} 小时` },
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard
          title="游戏时长分布"
          description="各游戏的累计游玩时长"
          action={
            <RangeSelect
              value={weeklyRange}
              onChange={(v) => setWeeklyRange(v as Range)}
              options={[
                ['week', '近 7 天'],
                ['six_months', '近六个月'],
              ]}
            />
          }
        >
          <Chart
            swapKey={swapSeq}
            type="bar"
            height={240}
            data={{
              labels: weeklyChart.labels,
              datasets: [
                {
                  label: '时长',
                  data: weeklyChart.values,
                  backgroundColor: 'oklch(0.8 0.115 195 / 0.75)',
                  hoverBackgroundColor: 'oklch(0.85 0.13 195)',
                  borderRadius: 6,
                  maxBarThickness: 22,
                },
              ],
            }}
            options={{
              indexAxis: 'y',
              scales: { x: { ...axis, beginAtZero: true }, y: axis },
              plugins: {
                legend: { display: false },
                tooltip: { ...tooltipStyle, callbacks: { label: (c) => `${c.parsed.x.toFixed(1)} 小时` } },
              },
            }}
          />
        </ChartCard>

        <ChartCard
          title="各游戏时长趋势"
          description="按游戏拆分的每日/每月游玩时长"
          action={
            <Select
              value={halfYearGranularity}
              onValueChange={(v) => setHalfYearGranularity(v as 'daily' | 'monthly')}
            >
              <SelectTrigger size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">按天</SelectItem>
                <SelectItem value="monthly">按月</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <Chart
            swapKey={swapSeq}
            type="line"
            height={240}
            data={{
              labels: halfYearChart.labels.map((l) => l.slice(5)),
              datasets: halfYearChart.datasets.map((d, i) => ({
                label: d.label,
                data: d.data,
                borderColor: colors.series[i % colors.series.length],
                backgroundColor: colors.series[i % colors.series.length],
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
              })),
            }}
            options={{
              scales: { x: axis, y: { ...axis, beginAtZero: true } },
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: {
                    color: colors.muted,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    boxWidth: 6,
                    padding: 14,
                  },
                },
                tooltip: {
                  ...tooltipStyle,
                  callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)} 小时` },
                },
              },
            }}
          />
        </ChartCard>

        <ChartCard
 title="游戏总时长占比" description="全部游戏的历史累计占比">
          <Chart
            swapKey={swapSeq}
            type="doughnut"
            height={240}
            data={{
              labels: distributionChart.labels,
              datasets: [
                {
                  data: distributionChart.values,
                  backgroundColor: distributionChart.labels.map(
                    (_, i) => colors.series[i % colors.series.length],
                  ),
                  borderColor: 'oklch(0.17 0.014 275)',
                  borderWidth: 2,
                  hoverOffset: 6,
                },
              ],
            }}
            options={{
              cutout: '62%',
              plugins: {
                legend: {
                  position: 'right',
                  labels: {
                    color: colors.muted,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    boxWidth: 6,
                    padding: 12,
                  },
                },
                tooltip: { ...tooltipStyle, callbacks: { label: (c) => `${c.label}: ${c.parsed.toFixed(1)} 小时` } },
              },
            }}
          />
        </ChartCard>
      </div>
    </div>
  );
}

/* ---- 单个游戏 ---- */

function SingleGamePanel({ game }: { game: Game }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [daily, setDaily] = useState<DailyTimePoint[]>(() => dailyCache.get(game.id) ?? []);
  const [trend, setTrend] = useState<TrendPoint[]>(() => trendCache.get(game.id) ?? []);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<'daily' | 'monthly'>('daily');
  const [refreshing, setRefreshing] = useState(false);
  const [swapSeq, setSwapSeq] = useState(0);

  const load = useCallback(async () => {
    // 有缓存时说明这次是回访，界面已经有内容了，不要再退回加载态把卡片藏起来
    const cached = dailyCache.has(game.id) && trendCache.has(game.id);
    if (!cached) setLoading(true);
    try {
      const [d, t] = await Promise.all([
        window.electronAPI.getGameDailyTimeData(game.id).catch(() => []),
        window.electronAPI.getGameTrendData(game.id).catch(() => []),
      ]);
      const nextDaily = Array.isArray(d) ? d : [];
      const nextTrend = Array.isArray(t) ? t : [];
      dailyCache.set(game.id, nextDaily);
      trendCache.set(game.id, nextTrend);
      setDaily(nextDaily);
      setTrend(nextTrend);
    } finally {
      setLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSeconds = daily.reduce((s, d) => s + d.total_time, 0);
  const activeDays = daily.filter((d) => d.total_time > 0).length;
  const best = daily.reduce<DailyTimePoint | null>(
    (acc, d) => (!acc || d.total_time > acc.total_time ? d : acc),
    null,
  );

  /** 趋势：daily 用趋势接口（有均值虚线），monthly 用半年数据按月汇总 */
  const trendChart = useMemo(() => {
    if (granularity === 'daily') {
      const values = trend.map((t) => t.total_time / 3600);
      const nonZero = values.filter((v) => v > 0);
      const average = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
      return { labels: trend.map((t) => t.date.slice(5)), values, average };
    }
    const buckets = new Map<string, number>();
    for (let i = 5; i >= 0; i--) buckets.set(dayjs().subtract(i, 'month').format('YYYY-MM'), 0);
    for (const p of daily) {
      const k = (p.date ?? '').slice(0, 7);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + p.total_time / 3600);
    }
    const values = [...buckets.values()];
    const nonZero = values.filter((v) => v > 0);
    const average = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    return { labels: [...buckets.keys()], values, average };
  }, [granularity, trend, daily]);

  /** 每周时长柱状 */
  const weeklyChart = useMemo(() => {
    const weeks = new Map<string, number>();
    const start = dayjs().startOf('week').subtract(11, 'week');
    for (let i = 0; i < 12; i++) weeks.set(start.add(i, 'week').format('MM-DD'), 0);
    for (const p of daily) {
      const k = dayjs(p.date).startOf('week').format('MM-DD');
      if (weeks.has(k)) weeks.set(k, (weeks.get(k) ?? 0) + p.total_time / 3600);
    }
    return { labels: [...weeks.keys()], values: [...weeks.values()] };
  }, [daily]);

  /** 星期分布环 */
  const weekdayChart = useMemo(() => {
    const buckets = new Array(7).fill(0) as number[];
    for (const p of daily) {
      const d = dayjs(p.date);
      if (d.isValid()) buckets[(d.day() + 6) % 7] += p.total_time / 3600;
    }
    return { labels: WEEKDAY_LABELS, values: buckets };
  }, [daily]);

  const axis = useChartAxis(colors);
  const tooltipStyle = useChartTooltip(colors);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="近半年累计"
          value={formatDuration(totalSeconds)}
          icon={Flame}
          tone="primary"
        />
        <StatCard label="历史累计" value={formatHours(game.total_time)} />
        <StatCard label="出勤天数" value={String(activeDays)} hint="近 6 个月" />
        <StatCard
          label="单日最长"
          value={best ? formatHours(best.total_time) : '—'}
          hint={best ? best.date : '暂无记录'}
        />
        <div className="flex items-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              setRefreshing(true);
              try {
                await Promise.all(ALL_TYPES.map((t) => window.electronAPI.refreshAnalysisData(t)));
                await load();
                setSwapSeq((n) => n + 1);
                toast.success('数据已刷新');
              } catch (err) {
                toast.error('刷新失败', err instanceof Error ? err.message : String(err));
              } finally {
                setRefreshing(false);
              }
            }}
            disabled={refreshing}
          >
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
            刷新数据
          </Button>
        </div>
      </div>

      {/* 只有「首次加载且还没有数据」才让位；刷新时保留旧卡片，
          否则 loading 一变 true 整棵树会被卸载，卡片消失一下再重新挂载。 */}
      {loading && daily.length === 0 ? null : daily.length === 0 ? (
        <EmptyState title="该游戏还没有时长记录" description="启动一次游戏后记录就会出现在这里。" />
      ) : (
        <>
          <div className="grid gap-4 2xl:grid-cols-2">
            <ChartCard
              title="时长趋势"
              description="虚线为有记录日子的平均值"
              action={
                <Select
                  value={granularity}
                  onValueChange={(v) => setGranularity(v as 'daily' | 'monthly')}
                >
                  <SelectTrigger size="sm" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">按天</SelectItem>
                    <SelectItem value="monthly">按月</SelectItem>
                  </SelectContent>
                </Select>
              }
            >
              <Chart
                swapKey={swapSeq}
                type="line"
                height={220}
                data={{
                  labels: trendChart.labels.map((l: string) => l.slice(5)),
                  datasets: [
                    {
                      label: '时长',
                      data: trendChart.values,
                      borderColor: colors.series[0],
                      backgroundColor: 'oklch(0.8 0.115 195 / 0.14)',
                      fill: true,
                      tension: 0.35,
                      pointRadius: 0,
                      pointHoverRadius: 4,
                      borderWidth: 2,
                    },
                    {
                      label: `平均 ${trendChart.average.toFixed(1)} 小时`,
                      data: trendChart.values.map(() => trendChart.average),
                      borderColor: 'oklch(0.78 0.12 340 / 0.7)',
                      borderDash: [5, 5],
                      pointRadius: 0,
                      borderWidth: 1.5,
                      fill: false,
                    },
                  ],
                }}
                options={{
                  scales: { x: axis, y: { ...axis, beginAtZero: true } },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...tooltipStyle,
                      callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)} 小时` },
                    },
                  },
                }}
              />
            </ChartCard>

            <ChartCard
 title="每周时长" description="最近 12 周的游玩分布">
              <Chart
                swapKey={swapSeq}
                type="bar"
                height={220}
                data={{
                  labels: weeklyChart.labels,
                  datasets: [
                    {
                      label: '时长',
                      data: weeklyChart.values,
                      backgroundColor: 'oklch(0.8 0.115 195 / 0.7)',
                      hoverBackgroundColor: 'oklch(0.85 0.13 195)',
                      borderRadius: 5,
                      maxBarThickness: 26,
                    },
                  ],
                }}
                options={{
                  scales: { x: axis, y: { ...axis, beginAtZero: true } },
                  plugins: {
                    legend: { display: false },
                    tooltip: { ...tooltipStyle, callbacks: { label: (c) => `${c.parsed.y.toFixed(1)} 小时` } },
                  },
                }}
              />
            </ChartCard>
          </div>

          <ContributionHeatmap data={daily} weeks={26} />

          <ChartCard
 title="星期分布" description="更爱在工作日还是周末玩游戏">
            <Chart
              swapKey={swapSeq}
              type="doughnut"
              height={220}
              data={{
                labels: weekdayChart.labels,
                datasets: [
                  {
                    data: weekdayChart.values,
                    backgroundColor: weekdayChart.labels.map(
                      (_, i) => colors.series[i % colors.series.length],
                    ),
                    borderColor: 'oklch(0.17 0.014 275)',
                    borderWidth: 2,
                    hoverOffset: 6,
                  },
                ],
              }}
              options={{
                cutout: '58%',
                plugins: {
                  legend: {
                    position: 'right',
                    labels: {
                      color: colors.muted,
                      usePointStyle: true,
                      pointStyle: 'circle',
                      boxWidth: 6,
                      padding: 12,
                    },
                  },
                  tooltip: { ...tooltipStyle, callbacks: { label: (c) => `${c.label}: ${c.parsed.toFixed(1)} 小时` } },
                },
              }}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 排行榜 */

function LeaderboardTab() {
  const [rows, setRows] = useState<
    { name: string; icon: string | null; total_time: number; end_time: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getLeaderboardData()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (rows.length === 0) return <EmptyState icon={Trophy} title="暂无排行数据" />;

  const max = Math.max(...rows.map((r) => r.total_time), 1);

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <div className="glass glass-sheen rounded-xl p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">累计时长</h3>
        <p className="tabular-nums text-3xl font-semibold">
          {formatDuration(rows.reduce((s, r) => s + (r.total_time ?? 0), 0))}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">共 {rows.length} 款游戏</p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div
            key={row.name}
            className="glass glass-sheen flex items-center gap-3 rounded-xl p-3 transition-transform duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-0.5"
          >
            <span
              className={cn(
                'tabular-nums grid size-7 shrink-0 place-items-center rounded-lg text-sm font-semibold',
                index === 0 && 'bg-primary/20 text-primary',
                index === 1 && 'bg-muted-foreground/20',
                index === 2 && 'bg-accent/20 text-accent',
                index > 2 && 'bg-muted text-muted-foreground',
              )}
            >
              {index + 1}
            </span>
            <img
              src={window.electronAPI.filePathToURL(row.icon) || './assets/app-icon.png'}
              alt=""
              className="size-9 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground">最后运行：{fromNow(row.end_time)}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${((row.total_time ?? 0) / max) * 100}%` }}
                />
              </div>
            </div>
            <span className="tabular-nums shrink-0 text-sm font-semibold">
              {formatHours(row.total_time)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 日志 */

function LogTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getLogData(page)
      .then((rows) => {
        if (cancelled) return;
        setLogs((prev) => [...prev, ...rows]);
        if (rows.length < LOG_PAGE_SIZE) setDone(true);
      })
      .catch(() => setDone(true));
    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !done) setPage((p) => p + 1);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [done]);

  if (logs.length === 0 && done) {
    return <EmptyState icon={ScrollText} title="暂无游玩记录" description="开始玩游戏后，记录会出现在这里。" />;
  }

  return (
    <div className="flex flex-col gap-2">
      {logs.map((log) => (
        <div key={log.id} className="glass glass-sheen flex items-center gap-3 rounded-xl p-3">
          <img
            src={window.electronAPI.filePathToURL(log.icon) || './assets/app-icon.png'}
            alt=""
            className="size-9 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{log.game_name}</p>
            <p className="tabular-nums text-xs text-muted-foreground">
              {dayjs(log.start_time).format('YYYY-MM-DD HH:mm')} →{' '}
              {log.end_time ? dayjs(log.end_time).format('HH:mm') : '进行中'}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="tabular-nums shrink-0">
                {formatDuration(log.duration)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 break-all font-mono text-[11px]">
            {log.path ?? '点击游戏库查看详情'}
            </TooltipContent>
          </Tooltip>
        </div>
      ))}
      <div ref={sentinelRef} className="h-8" />
      {done && logs.length > 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">没有更多记录了</p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- 工具 */

function RangeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useChartAxis(colors: { grid: string; muted: string }) {
  return useMemo(
    () => ({
      grid: { color: colors.grid, drawBorder: false },
      ticks: { color: colors.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
      border: { display: false },
    }),
    [colors],
  );
}

function useChartTooltip(colors: { text: string; muted: string }) {
  return useMemo(
    () => ({
      backgroundColor: 'oklch(0.22 0.017 275 / 0.95)',
      borderColor: 'oklch(1 0 0 / 0.1)',
      borderWidth: 1,
      titleColor: colors.text,
      bodyColor: colors.muted,
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
    }),
    [colors],
  );
}
