import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Settings2,
  Download,
  Upload,
  EyeOff,
  Trash2,
  Eraser,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, EmptyState } from '@/components/common/Primitives';
import { OverviewCard } from './OverviewCard';
import { PoolCard } from './PoolCard';
import { GACHA_GAMES, isGameId, ruleFor } from './config';
import { groupByPool, type CommonItem, type GachaRecord } from '@/lib/gacha';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const HIDDEN_POOLS_KEY = 'nekogame:hidden-pools';

function readHiddenPools(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_POOLS_KEY) ?? '[]') as string[];
    return new Set(raw);
  } catch {
    return new Set();
  }
}

export default function GachaPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const config = isGameId(gameId) ? GACHA_GAMES[gameId] : null;
  const toast = useToast();

  const [uids, setUids] = useState<string[]>([]);
  const [uid, setUid] = useState<string>('');
  const [records, setRecords] = useState<GachaRecord[]>([]);
  const [commonItems, setCommonItems] = useState<CommonItem[]>([]);
  const [hiddenPools, setHiddenPools] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  /** 抓取过程中主进程逐页汇报的「卡池 / 第几页」，用于刷新后展示 */
  const [fetchProgress, setFetchProgress] = useState('');

  const [poolPickerOpen, setPoolPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uidPickerOpen, setUidPickerOpen] = useState(false);
  /** 刷新数据后自增，强制重新拉一次记录，确保界面显示的是新数据 */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setHiddenPools(readHiddenPools());
  }, []);

  // 每个游戏的说明不同：原神/绝区零走米游社 CK，不需要先进游戏
  useEffect(() => {
    setStatus(config?.refreshHint ?? '');
    setFetchProgress('');
  }, [config]);

  // 主进程抓取时逐页广播「获取 <卡池> 第 N 页数据...」
  useEffect(() => {
    return window.electronAPI.onGachaRecordsStatus((next) => {
      setFetchProgress(next);
      setStatus(next);
    });
  }, []);

  const loadAll = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const [uidList, lastUid] = await Promise.all([
        window.electronAPI.invoke(config.channels.uids) as Promise<string[]>,
        window.electronAPI.invoke(config.channels.lastUid) as Promise<string | null>,
      ]);
      setUids(Array.isArray(uidList) ? uidList : []);
      const next = uid && uidList.includes(uid) ? uid : (lastUid ?? uidList[0] ?? '');
      setUid(next ?? '');
    } finally {
      setLoading(false);
    }
  }, [config, uid]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    if (!config || !uid) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const rows = (await window.electronAPI.invoke(config.channels.records)) as GachaRecord[];
      if (cancelled) return;
      const mine = Array.isArray(rows) ? rows.filter((r) => r.uid === uid) : [];
      setRecords(mine);
      if (mine.length === 0) {
        setCommonItems([]);
        return;
      }
      const items = (await window.electronAPI.invoke(
        'get-common-items',
        config.channels.commonItems,
        mine[0].lang || 'zh-cn',
      )) as CommonItem[];
      if (!cancelled) setCommonItems(Array.isArray(items) ? items : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [config, uid, reloadToken]);

  const pools = useMemo(() => {
    if (!config) return [];
    const grouped = groupByPool(records);
    return config.poolOrder
      .filter((name) => grouped[name]?.length)
      .map((name) => ({ name, records: grouped[name] }));
  }, [config, records]);

  const visiblePools = useMemo(
    () => pools.filter((p) => !hiddenPools.has(p.name)),
    [pools, hiddenPools],
  );

  const refresh = useCallback(async () => {
    if (!config) return;
    setRefreshing(true);
    setFetchProgress('');
    setStatus('正在获取抽卡记录…');
    try {
      const res = (await window.electronAPI.invoke(config.channels.refresh)) as {
        success?: boolean;
        message?: string;
      } | undefined;
      if (res && res.success === false) {
        throw new Error(res.message || '获取失败');
      }
      // 主进程可能刚写入了新的 UID，先同步列表
      await loadAll();
      // 再强制重拉一次记录，否则界面还停在刷新前的旧数据
      setReloadToken((t) => t + 1);
      setStatus(res?.message || `已更新于 ${new Date().toLocaleTimeString('zh-CN')}`);
      toast.success('抽卡记录已更新');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message);
      toast.error('获取失败', message);
    } finally {
      setRefreshing(false);
    }
  }, [config, loadAll]);

  const runChannel = useCallback(
    async (channel: string | undefined, successText: string, ...args: unknown[]) => {
      if (!channel) return;
      try {
        await window.electronAPI.invoke(channel, ...args);
        toast.success(successText);
      } catch (err) {
        toast.error('操作失败', err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  if (!config) {
    return <EmptyState title="未知的抽卡模块" />;
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <PageHeader
        title={config.title}
        description={config.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/tools')}>
              <ArrowLeft />
              返回
            </Button>
          </div>
        }
      />

      {/* 工具条 */}
      <div className="glass glass-sheen flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">UID</span>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : uids.length > 0 ? (
            <Select value={uid} onValueChange={setUid}>
              <SelectTrigger size="sm" className="w-36 font-mono">
                <SelectValue placeholder="选择 UID" />
              </SelectTrigger>
              <SelectContent>
                {uids.map((u) => (
                  <SelectItem key={u} value={u} className="font-mono">
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">请先刷新数据</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {refreshing && fetchProgress && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary/12 px-2 py-1 font-mono text-xs font-medium text-primary">
              <Loader2 className="size-3 animate-spin" />
              {fetchProgress.replace(/^获取\s*/, '').replace(/数据\.{3}$/, '')}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{status}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
            刷新数据
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="secondary" aria-label="模块设置">
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>导入 & 导出</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setUidPickerOpen(true)}>
                <Download />
                导出数据
              </DropdownMenuItem>
              {config.hasImport && (
                <DropdownMenuItem
                  onSelect={() => runChannel(config.channels.importData, '导入完成')}
                >
                  <Upload />
                  导入数据
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuLabel>其他设置</DropdownMenuLabel>
              {config.channels.clearUrlCache && (
                <DropdownMenuItem
                  onSelect={() => runChannel(config.channels.clearUrlCache, 'URL 缓存已清除')}
                >
                  <Eraser />
                  删除 URL 缓存文件
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setPoolPickerOpen(true)}>
                <EyeOff />
                隐藏卡池
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 />
                按时间删除抽卡记录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {uids.length === 0 && !loading ? (
        <EmptyState
          title="还没有该游戏的抽卡记录"
          description="先在游戏内打开抽卡界面（约半小时内），再点击「刷新数据」。"
          action={
            <Button onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
              刷新数据
            </Button>
          }
        />
      ) : visiblePools.length === 0 ? (
        <EmptyState
          title="没有可展示的卡池"
          description="所有卡池都被隐藏了，或该 UID 暂无记录。"
        />
      ) : (
        <>
          <OverviewCard config={config} records={records} />
          <div className="grid gap-4 2xl:grid-cols-2">
            {visiblePools.map((pool) => (
              <PoolCard
                key={pool.name}
                config={config}
                rule={ruleFor(config, pool.name)}
                records={pool.records}
                commonItems={commonItems}
              />
            ))}
          </div>
        </>
      )}

      {/* 隐藏卡池 */}
      <PoolPickerDialog
        open={poolPickerOpen}
        onOpenChange={setPoolPickerOpen}
        pools={pools.map((p) => p.name)}
        hidden={hiddenPools}
        onApply={(next) => {
          setHiddenPools(next);
          localStorage.setItem(HIDDEN_POOLS_KEY, JSON.stringify([...next]));
        }}
      />

      {/* 导出 UID 选择 */}
      <UidPickerDialog
        open={uidPickerOpen}
        onOpenChange={setUidPickerOpen}
        uids={uids}
        onConfirm={async (selected) => {
          setUidPickerOpen(false);
          await runChannel(config.channels.exportData, '导出完成', [...selected]);
        }}
      />

      {/* 按时间删除 */}
      <DeleteByTimeDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        uids={uids}
        defaultUid={uid}
        config={config}
      />
    </div>
  );
}

/* --------------------------------------------------------------- 对话框 */

function PoolPickerDialog({
  open,
  onOpenChange,
  pools,
  hidden,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pools: string[];
  hidden: Set<string>;
  onApply: (next: Set<string>) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(hidden));
  useEffect(() => {
    if (open) setDraft(new Set(hidden));
  }, [open, hidden]);

  const allNames = useMemo(
    () => [...new Set([...pools, ...hidden])].filter(Boolean),
    [pools, hidden],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>隐藏卡池</DialogTitle>
          <DialogDescription>选中的卡池不会在页面展示，仅影响显示，不删除数据。</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {allNames.map((name) => {
            const active = draft.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() =>
                  setDraft((prev) => {
                    const next = new Set(prev);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/15 text-foreground'
                    : 'border-border hover:bg-accent/50',
                )}
              >
                {name}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="secondary" onClick={() => setDraft(new Set(allNames))}>
            全选
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            应用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UidPickerDialog({
  open,
  onOpenChange,
  uids,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  uids: string[];
  onConfirm: (selected: Set<string>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(new Set());
  }, [open]);

  const all = uids.length > 0 && uids.every((u) => draft.has(u));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>选择要导出的 UID</DialogTitle>
          <DialogDescription>可多选，导出的文件将包含所选账号的全部抽卡记录。</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
          {uids.map((u) => {
            const active = draft.has(u);
            return (
              <button
                key={u}
                type="button"
                onClick={() =>
                  setDraft((prev) => {
                    const next = new Set(prev);
                    if (next.has(u)) next.delete(u);
                    else next.add(u);
                    return next;
                  })
                }
                className={cn(
                  'rounded-lg border px-3 py-2 font-mono text-sm transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/15'
                    : 'border-border hover:bg-accent/50',
                )}
              >
                {u}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setDraft(all ? new Set() : new Set(uids))}
          >
            {all ? '取消全选' : '全选'}
          </Button>
          <Button
            disabled={draft.size === 0 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(draft);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '导出中…' : `导出（${draft.size}）`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteByTimeDialog({
  open,
  onOpenChange,
  uids,
  defaultUid,
  config,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  uids: string[];
  defaultUid: string;
  config: (typeof GACHA_GAMES)[keyof typeof GACHA_GAMES];
}) {
  const toast = useToast();
  const [uid, setUid] = useState(defaultUid);
  const [total, setTotal] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setUid(defaultUid);
      setTotal(null);
      setStart('');
      setEnd('');
    }
  }, [open, defaultUid]);

  const count = useCallback(async () => {
    if (!uid || !start || !end) return;
    try {
      const res = (await window.electronAPI.invoke(
        'count-gacha-records-by-time',
        uid,
        config.id,
        start,
        end,
      )) as { count?: number } | number;
      setTotal(typeof res === 'number' ? res : (res?.count ?? null));
    } catch {
      setTotal(null);
    }
  }, [uid, start, end, config.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>按时间删除抽卡记录</DialogTitle>
          <DialogDescription>
            删除操作不可撤销，且之后只能获取近半年的记录，请确认时间范围正确。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-muted-foreground">UID</Label>
            {uids.length > 0 ? (
              <Select value={uid} onValueChange={setUid}>
                <SelectTrigger size="sm" className="w-36 font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uids.map((u) => (
                    <SelectItem key={u} value={u} className="font-mono">
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm text-muted-foreground">-</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label className="text-muted-foreground">该账号有</Label>
            <span className="tabular-nums text-sm">{total ?? '—'} 条记录</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gacha-start" className="text-muted-foreground">
              起始时间
            </Label>
            <Input
              id="gacha-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-56"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gacha-end" className="text-muted-foreground">
              结束时间
            </Label>
            <Input
              id="gacha-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-56"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="secondary" onClick={count} disabled={!uid || !start || !end}>
            统计
          </Button>
          <Button
            variant="destructive"
            disabled={!uid || !start || !end || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await window.electronAPI.invoke(
                  'delete-gacha-records-by-time',
                  uid,
                  config.id,
                  start,
                  end,
                );
                toast.success('已删除对应时间段内的抽卡记录');
                onOpenChange(false);
              } catch (err) {
                toast.error('删除失败', err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '删除中…' : '删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
