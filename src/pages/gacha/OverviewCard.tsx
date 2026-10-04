import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chart } from '@/components/chart/Chart';
import { resolveCssColor, seriesBorderColor } from '@/lib/chart-color';
import { groupByPool, type GachaRecord } from '@/lib/gacha';
import type { GachaGameConfig } from './config';

/**
 * 祈愿概览：只取 TeyvatGuide「图表概览」里的两个饼图——
 * 卡池分布 与 星级分布（gro-chart-overview.vue:111-183）。
 * 他另外的角色池/武器池玫瑰图与甜甜圈图不在这里重复。
 */
export function OverviewCard({
  config,
  records,
}: {
  config: GachaGameConfig;
  records: GachaRecord[];
}) {
  const pools = useMemo(() => {
    const grouped = groupByPool(records);
    // 沿用配置里的卡池顺序，没列出的历史卡池补在后面
    const known = config.poolOrder.filter((name) => grouped[name]?.length);
    const rest = Object.keys(grouped)
      .filter((name) => !config.poolOrder.includes(name) && grouped[name].length)
      .sort();
    return [...known, ...rest].map((name) => ({ name, count: grouped[name].length }));
  }, [config, records]);

  const stars = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of records) counts.set(r.quality_level, (counts.get(r.quality_level) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([level, count]) => ({
        label: config.qualityLabel(level, config.fallbackRule),
        count,
        color: starColor(level, config),
      }));
  }, [config, records]);

  // canvas 不认 var()，颜色必须先解析成真实色值
  const poolColors = useMemo(
    () => pools.map((_, i) => resolveCssColor(`--chart-${(i % 5) + 1}`, '#4b9fd5')),
    [pools],
  );

  const total = records.length;
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>祈愿概览</CardTitle>
        <CardDescription>共 {total} 条记录</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <Pie
          title="卡池分布"
          subtitle={`共 ${total} 条`}
          labels={pools.map((p) => p.name)}
          values={pools.map((p) => p.count)}
          colors={poolColors}
        />
        <Pie
          title="星级分布"
          subtitle={`共 ${total} 条`}
          labels={stars.map((s) => s.label)}
          values={stars.map((s) => s.count)}
          colors={stars.map((s) => s.color)}
        />
      </CardContent>
    </Card>
  );
}

function starColor(level: number, config: GachaGameConfig): string {
  if (level === config.fallbackRule.top) return resolveCssColor('--gacha-5', '#d19a66');
  if (level === config.fallbackRule.mid) return resolveCssColor('--gacha-4', '#c678dd');
  return resolveCssColor('--gacha-3', '#61afef');
}

/**
 * TeyvatGuide 用的是 radius: '50%' 的实心饼（不是环形），
 * 图例竖排在右侧，标题在上、subtext 显示条数。
 */
function Pie({
  title,
  subtitle,
  labels,
  values,
  colors,
}: {
  title: string;
  subtitle: string;
  labels: string[];
  values: number[];
  colors: string[];
}) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          // 描边走面板底色 token，与全应用的环形图一致；之前这里是硬编码深色，且和主页用的值不同
          borderColor: seriesBorderColor(),
          borderWidth: 2,
        },
      ],
    }),
    [labels, values, colors],
  );
  const options = useMemo(
    () => ({
      cutout: 0,
      plugins: { legend: { display: false } },
    }),
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4">
        <Chart
          type="doughnut"
          height={150}
          className="w-[150px] shrink-0"
          data={data}
          options={options}
          ariaLabel={`${title}饼图`}
        />
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {labels.map((label, i) => (
            <li key={label} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: colors[i] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
              <span className="tabular-nums font-medium">{values[i]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
