import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, MoreVertical, Trash2, Pencil, Play, Library as LibraryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader, StatCard, EmptyState } from '@/components/common/Primitives';
import { ChartCard } from '@/components/chart/ChartCard';
import { Chart } from '@/components/chart/Chart';
import { ContributionHeatmap } from '@/components/library/ContributionHeatmap';
import { GameFormDialog } from '@/components/library/GameFormDialog';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { formatDuration, formatHours, fromNow } from '@/lib/format';
import type { DailyTimePoint, Game, GameDataInput, GameDetails } from '@/types/domain';

export default function LibraryPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [daily, setDaily] = useState<DailyTimePoint[]>([]);
  const [trend, setTrend] = useState<{ date: string; total_time: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GameDataInput | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await window.electronAPI.loadGames();
      setGames(rows);
      setSelectedId((prev) => (prev && rows.some((g) => g.id === prev) ? prev : (rows[0]?.id ?? null)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (selectedId == null) {
      setDetails(null);
      setDaily([]);
      setTrend([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [d, day, tr] = await Promise.all([
        window.electronAPI.getGameDetails(selectedId),
        window.electronAPI.getGameDailyTimeData(selectedId).catch(() => []),
        window.electronAPI.getGameTrendData(selectedId).catch(() => []),
      ]);
      if (cancelled) return;
      setDetails(d);
      setDaily(Array.isArray(day) ? day : []);
      setTrend(Array.isArray(tr) ? tr : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const submitGame = useCallback(
    async (data: GameDataInput) => {
      if (data.id) {
        await window.electronAPI.updateGame(data);
      } else {
        await window.electronAPI.addGame(data);
      }
      await loadGames();
    },
    [loadGames],
  );

  const removeGame = useCallback(async () => {
    if (selectedId == null) return;
    await window.electronAPI.deleteGame(selectedId);
    setConfirmDelete(false);
    setSelectedId(null);
    await loadGames();
  }, [selectedId, loadGames]);

  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <PageHeader
          title="游戏库"
        description={`${games.length} 款游戏正在记录时长`}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            添加游戏
          </Button>
        }
      />

      {loading && games.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : games.length === 0 ? (
        <EmptyState
          icon={LibraryIcon}
          title="游戏库还是空的"
          description="添加一款游戏并指向它的主程序，NekoGame 就会自动记录游玩时长。"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              添加游戏
            </Button>
          }
        />
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col gap-2">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                active={game.id === selectedId}
                onSelect={() => setSelectedId(game.id)}
              />
            ))}
          </div>

          {details ? (
            <GameDetail
              details={details}
              daily={daily}
              trend={trend}
              onEdit={() => {
                setEditing({
                  id: details.path ? selectedId! : selectedId!,
                  name: details.name,
                  path: details.path,
                  icon: details.icon,
                  poster_vertical: details.poster_vertical,
                  poster_horizontal: details.poster_horizontal,
                });
                setFormOpen(true);
              }}
              onDelete={() => setConfirmDelete(true)}
            />
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      )}

      <GameFormDialog
        open={formOpen}
        initial={editing}
        onOpenChange={setFormOpen}
        onSubmit={submitGame}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除游戏</DialogTitle>
            <DialogDescription>
            将同时删除「{details?.name}」及其全部游玩时长记录，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={removeGame}>
              <Trash2 />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ 列表 */

function GameCard({
  game,
  active,
  onSelect,
}: {
  game: Game;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl p-2 text-left transition-all duration-200 ease-[var(--ease-out-expo)]',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active
          ? 'bg-surface-raised ring-1 ring-primary/50'
          : 'bg-surface/60 hover:-translate-y-0.5 hover:bg-surface-raised',
      )}
    >
      {game.poster_horizontal && (
        <img
          src={window.electronAPI.filePathToURL(game.poster_horizontal, 320)}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-15"
          aria-hidden
        />
      )}
      <img
        src={window.electronAPI.filePathToURL(game.icon, 44) || './assets/app-icon.png'}
        alt=""
        className="relative size-11 shrink-0 rounded-lg object-cover shadow-md"
      />
      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{game.name}</p>
        <p className="tabular-nums text-xs text-muted-foreground">
          总计 {formatHours(game.total_time)} · 近两周 {formatHours(game.two_weeks_time ?? 0)}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ 详情 */

function GameDetail({
  details,
  daily,
  trend,
  onEdit,
  onDelete,
}: {
  details: GameDetails;
  daily: DailyTimePoint[];
  trend: { date: string; total_time: number }[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();

  const trendChart = useMemo(() => {
    const values = trend.map((t) => t.total_time / 3600);
    const nonZero = values.filter((v) => v > 0);
    const average = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
    return { labels: trend.map((t) => t.date.slice(5)), values, average };
  }, [trend]);

  const axis = useMemo(
    () => ({
      grid: { color: colors.grid, drawBorder: false },
      ticks: { color: colors.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 16 },
      border: { display: false },
    }),
    [colors],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={window.electronAPI.filePathToURL(details.icon, 36) || './assets/app-icon.png'}
              alt=""
              className="size-14 shrink-0 rounded-xl object-cover shadow-lg"
            />
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{details.name}</CardTitle>
              <CardDescription className="mt-0.5">
                最近游玩：{fromNow(details.last_played)}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.electronAPI.launchGame(details.path)}
                >
                  <Play />
                  启动
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 break-all font-mono text-[11px]">
                {details.path}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  编辑游戏
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 />
                  删除游戏
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 sm:grid-cols-4">
          <StatCard label="总时长" value={formatDuration(details.total_time)} />
          <StatCard
            label="出勤日均时长"
            value={details.avg_daily_time ? `${details.avg_daily_time.toFixed(2)} h` : '—'}
            hint="近 6 个月"
          />
          <StatCard label="总时长排名" value={String(details.rank ?? '—')} hint="全部游戏" />
          <StatCard
            label="出勤天数"
            value={String(daily.filter((d) => d.total_time > 0).length)}
            hint="近 6 个月"
          />
        </CardContent>
      </Card>

      <ContributionHeatmap data={daily} />

      <ChartCard
        title="出勤日时长趋势"
        description="最近 30 个有记录的出勤日"
        action={
          trendChart.average > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              平均 {trendChart.average.toFixed(1)} h
            </Badge>
          ) : null
        }
      >
        {trend.length === 0 ? (
          <EmptyState title="暂无趋势数据" className="py-10" />
        ) : (
          <Chart
            type="line"
            height={220}
            data={{
              labels: trendChart.labels,
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
                ...(trendChart.average > 0
                  ? [
                      {
                        label: '平均',
                        data: trendChart.values.map(() => trendChart.average),
                        borderColor: 'oklch(0.78 0.12 340 / 0.7)',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        borderWidth: 1.5,
                        fill: false,
                      },
                    ]
                  : []),
              ],
            }}
            options={{
              scales: { x: axis, y: { ...axis, beginAtZero: true } },
              plugins: { legend: { display: false } },
            }}
          />
        )}
      </ChartCard>
    </div>
  );
}
