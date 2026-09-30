import { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  calculateDrawsBetween,
  calculateLastDraws,
  calculateMostDraws,
  calculateNoDeviationRate,
  calculateUpAverage,
  getRating,
  type CommonItem,
  type GachaRecord,
} from '@/lib/gacha';
import { RecordList } from './RecordList';
import type { GachaGameConfig, PoolRule } from './config';

interface PoolCardProps {
  config: GachaGameConfig;
  rule: PoolRule;
  records: GachaRecord[];
  commonItems: CommonItem[];
}

export function PoolCard({ config, rule, records, commonItems }: PoolCardProps) {
  const isUpPool = config.upPools.includes(rule.name);
  const emptyTop = `暂未抽出${rule.topName}`;

  const avgTop = calculateDrawsBetween(records, rule.top, `还没抽出${rule.topName}`);
  const avgUp = isUpPool ? calculateUpAverage(records, commonItems, rule.top, config.upPools) : null;
  const avgTopNumber = typeof avgTop === 'number' ? avgTop : null;
  const avgUpNumber = typeof avgUp === 'number' ? avgUp : null;

  const extreme = calculateMostDraws(records, rule.top, emptyTop);
  const mostDraws = typeof extreme === 'string' ? null : extreme.maxDraws;
  const leastDraws = typeof extreme === 'string' ? null : extreme.minDraws;

  const pityTop = calculateLastDraws(records, rule.top);
  const pityMid = calculateLastDraws(records, rule.mid);

  const rating = getRating(avgTop, avgUp, rule.rating);
  const noDeviation = isUpPool ? calculateNoDeviationRate(records, commonItems, rule.top) : null;

  const starCounts = useMemo(
    () => ({
      labels: [rule.topName, rule.midName, '其余'],
      values: [
        records.filter((r) => r.quality_level === rule.top).length,
        records.filter((r) => r.quality_level === rule.mid).length,
        records.filter((r) => r.quality_level !== rule.top && r.quality_level !== rule.mid).length,
      ],
    }),
    [records, rule],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate">{rule.name}</CardTitle>
          {isUpPool && <Badge variant="secondary">UP 池</Badge>}
        </div>
        <span className="tabular-nums shrink-0 text-sm text-muted-foreground">
          {records.length} 抽
        </span>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="stats">
          <TabsList>
            <TabsTrigger value="stats">统计</TabsTrigger>
            <TabsTrigger value="rating">评分</TabsTrigger>
            <TabsTrigger value="records">记录</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="flex flex-col gap-4 pt-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <PityBar label={`距离上个${rule.topName}`} value={pityTop} max={rule.topPity} tone="top" />
              <PityBar label={`距离上个${rule.midName}`} value={pityMid} max={rule.midPity} tone="mid" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label={config.statLabels.avg} value={fmt(avgTopNumber, 2)} />
              <Stat
                label={config.statLabels.up}
                value={isUpPool ? fmt(avgUpNumber, 2) : '—'}
                muted={!isUpPool}
              />
              <Stat label={config.statLabels.most} value={mostDraws === null ? '—' : String(mostDraws)} />
              <Stat label={config.statLabels.least} value={leastDraws === null ? '—' : String(leastDraws)} />
            </div>
          </TabsContent>

          <TabsContent value="rating" className="flex flex-col gap-4 pt-1">
            <div className="flex flex-wrap items-center gap-5">
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">生涯评级</p>
                  <p className="text-lg font-semibold" style={{ color: config.accent }}>
                    {rating}
                  </p>
                </div>
                {noDeviation && (
                  <div>
                    <p className="text-xs text-muted-foreground">不歪概率</p>
                    <p className="tabular-nums text-sm">{noDeviation}</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  记录区间 {records[records.length - 1]?.timestamp?.slice(0, 10) ?? '—'} →{' '}
                  {records[0]?.timestamp?.slice(0, 10) ?? '—'}
                </p>
              </div>

              {/* 星级占比：顶部「祈愿概览」已有全账号饼图，这里只列本卡池的计数 */}
              <div className="tabular-nums flex shrink-0 gap-4 text-xs">
                {starCounts.labels.map((label, i) => (
                  <div key={label} className="text-center">
                    <div className="text-base font-semibold">{starCounts.values[i]}</div>
                    <div className="text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="records" className="pt-1">
            <RecordList config={config} rule={rule} records={records} commonItems={commonItems} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function fmt(value: number | null, digits: number): string {
  return value === null ? '—' : value.toFixed(digits);
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="glass-sheen rounded-lg px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums mt-0.5 text-base font-semibold', muted && 'text-muted-foreground')}>
        {value}
      </p>
    </div>
  );
}

function PityBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'top' | 'mid';
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="rounded-lg px-3 py-2">
      <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">
          {value}
          <span className="text-muted-foreground"> / {max}</span>
        </span>
      </div>
      <Progress
        value={pct}
        className={cn('h-1.5', tone === 'top' ? '[&>div]:bg-gacha-5' : '[&>div]:bg-gacha-4')}
      />
    </div>
  );
}
