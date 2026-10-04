import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['一', '', '三', '', '五', '', '日'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 与旧版一致的 5 档配色，但基于主题色阶，浅色主题下同样可读 */
const LEVEL_CLASSES = [
  'bg-muted/60',
  'bg-primary/25',
  'bg-primary/45',
  'bg-primary/70',
  'bg-primary',
];

function levelOf(hours: number): number {
  if (hours <= 0) return 0;
  if (hours < 1) return 1;
  if (hours < 2) return 2;
  if (hours < 4) return 3;
  return 4;
}

export function ContributionHeatmap({
  data,
  weeks = 26,
}: {
  data: { date: string; total_time: number }[];
  weeks?: number;
}) {
  // 提示统一交给 Radix Tooltip：之前每个格子还挂了一套自绘浮层，
  // 悬停时同屏出现两个内容相同的提示，且每次 hover 都让整张热力图重渲染
  const { columns, monthMarkers } = useMemo(() => {
    const byDate = new Map(data.map((d) => [d.date, d.total_time / 3600]));
    // 对齐到本周日结束，逐列（周）填充
    const end = dayjs().endOf('week');
    const start = end.subtract(weeks * 7 - 1, 'day').startOf('day');
    const cols: { date: string; hours: number | null }[][] = [];
    const markers: { label: string; col: number }[] = [];
    let lastMonth = -1;

    for (let w = 0; w < weeks; w++) {
      const col: { date: string; hours: number | null }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = start.add(w * 7 + d, 'day');
        const key = day.format('YYYY-MM-DD');
        // 今天之后留空，避免把「未来」涂成有游玩
        col.push({ date: key, hours: day.isAfter(dayjs(), 'day') ? null : (byDate.get(key) ?? 0) });
      }
      cols.push(col);
      const first = start.add(w * 7, 'day');
      if (first.month() !== lastMonth) {
        lastMonth = first.month();
        markers.push({ label: MONTH_LABELS[first.month()], col: w });
      }
    }
    return { columns: cols, monthMarkers: markers };
  }, [data, weeks]);

  const activeDays = data.filter((d) => d.total_time > 0).length;
  const totalHours = data.reduce((s, d) => s + d.total_time, 0) / 3600;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>出勤表</CardTitle>
          <CardDescription>
            近 {weeks} 周共 {activeDays} 天出勤，合计 {totalHours.toFixed(1)} 小时
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          少
          {LEVEL_CLASSES.map((cls, i) => (
            <span key={i} className={cn('size-3 rounded-[3px]', cls)} />
          ))}
          多
        </div>
      </CardHeader>

      <CardContent>
        <div className="relative overflow-x-auto pb-1">
          <div className="min-w-max">
            {/* 月份刻度 */}
            <div
              className="relative mb-1 ml-7 h-4 text-[10px] text-muted-foreground"
              style={{ width: `${columns.length * 15}px` }}
            >
              {monthMarkers.map((m) => (
                <span key={`${m.col}-${m.label}`} className="absolute" style={{ left: m.col * 15 }}>
                  {m.label}
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              {/* 星期刻度 */}
              <div className="grid shrink-0 grid-rows-7 gap-[3px] text-[10px] text-muted-foreground">
                {WEEKDAYS.map((d, i) => (
                  <span key={i} className="flex h-3 items-center">
                    {d}
                  </span>
                ))}
              </div>

              <div className="flex gap-[3px]">
                {columns.map((col, ci) => (
                  <div key={ci} className="grid grid-rows-7 gap-[3px]">
                    {col.map((cell) => (
                      <Tooltip key={cell.date}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={cell.hours === null}
                            className={cn(
                              'size-3 rounded-[3px] transition-all duration-150',
                              cell.hours === null && 'bg-transparent',
                              cell.hours !== null && LEVEL_CLASSES[levelOf(cell.hours)],
                              'hover:ring-1 hover:ring-ring hover:ring-offset-1 hover:ring-offset-transparent',
                            )}
                            aria-label={`${cell.date} ${(cell.hours ?? 0).toFixed(1)} 小时`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {cell.date} · {(cell.hours ?? 0).toFixed(1)} 小时
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
