import { useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/common/Primitives';
import { cn } from '@/lib/utils';
import {
  annotateDraws,
  groupByDate,
  isCommonItem,
  type CommonItem,
  type GachaRecord,
} from '@/lib/gacha';
import type { GachaGameConfig, PoolRule } from './config';

type Annotated = GachaRecord & { draws: number | null; offBanner: boolean };

interface RecordListProps {
  config: GachaGameConfig;
  rule: PoolRule;
  records: GachaRecord[];
  commonItems: CommonItem[];
}

type Mode = 'top' | 'all';

/**
 * 抽卡记录列表。版式参考 TeyvatGuide：
 * 单行卡片、右侧抽数、旋转 25° 的 歪/UP 圆形标记、底边贴着卡片的保底进度条。
 * 没有图标资源，所以星级用文字标签代替。
 */
export function RecordList({ config, rule, records, commonItems }: RecordListProps) {
  const [mode, setMode] = useState<Mode>('top');
  const isUpPool = config.upPools.includes(rule.name);

  const annotated = useMemo(
    () => annotateDraws(records, rule.top, rule.mid, commonItems, config.upPools),
    [records, rule, commonItems, config.upPools],
  );

  const topRecords = useMemo(
    () => annotated.filter((r) => r.quality_level === rule.top),
    [annotated, rule.top],
  );

  const visible: Annotated[] = mode === 'top' ? topRecords : annotated;

  const groups = useMemo(() => {
    // 只看最高星级时不需要按天分组，一列铺开更省空间
    if (mode === 'top') return null;
    return groupByDate(annotated);
  }, [mode, annotated]);

  const topTotal = topRecords.length;
  const offCount = topRecords.filter((r) => r.offBanner).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 self-start rounded-lg bg-surface-sunken p-1 text-xs">
          <ModeButton active={mode === 'top'} onClick={() => setMode('top')}>
            只看{rule.topName}
            <span className="ml-1 tabular-nums opacity-60">{topTotal}</span>
          </ModeButton>
          <ModeButton active={mode === 'all'} onClick={() => setMode('all')}>
            全部
            <span className="ml-1 tabular-nums opacity-60">{annotated.length}</span>
          </ModeButton>
        </div>
        {mode === 'top' && isUpPool && topTotal > 0 && (
          <span className="tabular-nums text-xs text-muted-foreground">
            其中 {offCount} 抽为常驻（歪），歪率{' '}
            <span className={cn('font-medium', offCount > 0 ? 'text-destructive' : 'text-success')}>
              {((offCount / topTotal) * 100).toFixed(1)}%
            </span>
          </span>
        )}
      </div>

      <div className="max-h-[460px] overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <EmptyState title={`还没有抽到${rule.topName}`} className="py-8" />
        ) : groups ? (
          <div className="flex flex-col gap-4">
            {groups.map(([date, items]) => (
              <section key={date}>
                <h4 className="sticky top-0 z-10 -mx-1 mb-1.5 bg-background/85 px-1 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                  {date}
                  <span className="ml-1.5 tabular-nums opacity-70">{items.length} 抽</span>
                </h4>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => (
                    <GachaRow
                      key={r.id}
                      record={r}
                      rule={rule}
                      config={config}
                      commonItems={commonItems}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((r) => (
              <GachaRow
                key={r.id}
                record={r}
                rule={rule}
                config={config}
                commonItems={commonItems}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1 font-medium transition-colors',
        active ? 'bg-surface-raised text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function GachaRow({
  record,
  rule,
  config,
  commonItems,
}: {
  record: Annotated;
  rule: PoolRule;
  config: GachaGameConfig;
  commonItems: CommonItem[];
}) {
  const isTop = record.quality_level === rule.top;
  const isMid = record.quality_level === rule.mid;
  const color = isTop
    ? 'var(--gacha-5)'
    : isMid
      ? 'var(--gacha-4)'
      : 'var(--gacha-3)';

  const isUpPool = config.upPools.includes(record.card_pool_type);
  // 常驻池不判定 UP/歪
  const showBadge = isTop && isUpPool;
  const off = showBadge
    ? isCommonItem(record.name, record.timestamp, commonItems)
    : record.offBanner;

  // 保底进度：五星按 90/70 算，四星按 10/5 算
  const hardPity = isTop
    ? rule.topPity
    : isMid
      ? rule.midPity
      : 0;
  const progress = hardPity > 0 && record.draws !== null
    ? Math.min(100, (record.draws / hardPity) * 100)
    : 0;
  const progressColor = off ? 'var(--gacha-offbanner)' : color;

  return (
    <li
      className="relative flex h-12 items-center gap-2 overflow-hidden rounded-md border border-border bg-gacha-row px-2"
    >
      {/* 贴着卡片底边的保底进度条 */}
      {progress > 0 && (
        <span
          className="absolute bottom-0 left-0 h-1 rounded-md"
          style={{ width: `${progress}%`, background: progressColor, opacity: 0.85 }}
          aria-hidden
        />
      )}

      <span
        className="w-11 shrink-0 text-[11px] font-semibold"
        style={{ color }}
      >
        {config.qualityLabel(record.quality_level, rule)}
      </span>

      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm">{record.name}</span>
        <span className="tabular-nums block text-[11px] text-muted-foreground">
          {record.timestamp?.slice(0, 16) ?? '—'}
        </span>
      </span>

      {record.draws !== null && (
        <span
          className="tabular-nums shrink-0 text-sm font-semibold"
          style={{ color: progressColor }}
        >
          {record.draws}
          <span className="ml-0.5 text-[10px] font-normal opacity-70">抽</span>
        </span>
      )}

      {showBadge && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="grid size-8 shrink-0 rotate-[25deg] place-items-center rounded-full bg-gacha-badge text-xs font-bold"
              style={{ color: off ? 'var(--gacha-offbanner)' : color }}
            >
              {off ? '歪' : 'UP'}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {off ? '该物品在抽出时已进入常驻池' : '当期 UP'}
          </TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}
