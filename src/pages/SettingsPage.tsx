import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FolderOpen,
  Image as ImageIcon,
  RotateCcw,
  Database,
  Cloud,
  Link2,
  FileJson,
  QrCode,
  LogOut,
  RefreshCw,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/Primitives';
import { BACKGROUND_STYLES, useBackground } from '@/hooks/useBackground';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

const GENERAL_KEYS = [
  {
    key: 'minimizeToTray',
    label: '最小化到托盘',
    hint: '点击关闭按钮时缩到系统托盘而不是退出',
  },
  {
    key: 'silentMode',
    label: '静默运行',
    hint: '下次启动时不显示窗口，只在托盘运行',
  },
  {
    key: 'autoLaunch',
    label: '开机自启动',
    hint: '登录系统后自动运行 NekoGame',
  },
  {
    key: 'hardwareAcceleration',
    label: '禁用硬件加速',
    hint: '需要重启生效；出现画面异常或卡顿时可尝试开启',
    needsRestart: true,
  },
] as const;

interface MhyInfo {
  loggedIn: boolean;
  nickname?: string;
  accountId?: string;
  updated?: string;
  message?: string;
  games?: Record<
    string,
    {
      label: string;
      cookieSupported: boolean;
      candidates: { uid: string; region: string; regionName: string; level: number }[];
    }
  >;
}

export default function SettingsPage() {
  const toast = useToast();
  const { settings, style, setStyle, update, restoreDefault } = useBackground();

  const [general, setGeneral] = useState<Record<string, string>>({});
  const [dataPath, setDataPath] = useState('');
  const [mhy, setMhy] = useState<MhyInfo | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI
      .invoke('load-settings')
      .then((raw) => setGeneral((raw ?? {}) as Record<string, string>));
    void window.electronAPI
      .getDataFilePath()
      .then((r) => setDataPath(r.path))
      .catch(() => {});
    void refreshMhy();
  }, []);

  const refreshMhy = useCallback(async () => {
    try {
      const info = (await window.electronAPI.invoke('mhy-account-info')) as MhyInfo;
      setMhy(info);
    } catch {
      setMhy(null);
    }
  }, []);

  const toggle = async (key: string, value: boolean) => {
    setGeneral((prev) => ({ ...prev, [key]: String(value) }));
    await window.electronAPI.invoke('save-setting', key, String(value));
    if (key === 'autoLaunch') await window.electronAPI.setAutoLaunch(value);
  };

  const run = async (id: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      toast.error('操作失败', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <PageHeader title="设置" description="常规选项、外观、数据与账号" />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* 常规 */}
        <Card>
          <CardHeader>
            <CardTitle>常规设置</CardTitle>
            <CardDescription>建议日常使用时保持全部开启</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {GENERAL_KEYS.map((item) => {
              const on = general[item.key] === 'true';
              return (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <Label htmlFor={item.key} className="cursor-pointer">
                      {item.label}
                      {'needsRestart' in item && item.needsRestart && (
                        <Badge variant="secondary" className="ml-2">
                          需重启
                        </Badge>
                      )}
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>
                  </div>
                  <Switch
                    id={item.key}
                    checked={on}
                    onCheckedChange={(v) => void toggle(item.key, v)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 背景 */}
        <Card>
          <CardHeader>
            <CardTitle>背景设置</CardTitle>
            <CardDescription>壁纸会被模糊处理以保证前景可读性</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>呈现方式</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {BACKGROUND_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      style === s.id
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border hover:bg-accent/50',
                    )}
                  >
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>背景图片</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={settings.backgroundImage ?? ''}
                  placeholder="未设置背景图片"
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={async () => {
                    const res = await window.electronAPI.selectBackgroundFile();
                    if (res.canceled || !res.filePaths[0]) return;
                    await update({ backgroundImage: res.filePaths[0] });
                    toast.success('背景已更新');
                  }}
                >
                  <ImageIcon />
                  选择
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="bg-opacity">背景遮罩强度</Label>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {Math.round(settings.backgroundOpacity * 100)}%
                </span>
              </div>
              <input
                id="bg-opacity"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.backgroundOpacity}
                onChange={(e) => void update({ backgroundOpacity: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">
                数值越大壁纸越暗。低于下限时会按下限显示，以保证文字始终可读。
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setRestoreOpen(true)}
            >
              <RotateCcw />
              恢复默认背景配置
            </Button>
          </CardContent>
        </Card>

        {/* 数据管理 */}
        <Card>
          <CardHeader>
            <CardTitle>数据管理</CardTitle>
            <CardDescription>时长与抽卡记录都保存在本地</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy === 'check'}
                onClick={() =>
                  run('check', () => window.electronAPI.checkErrors(), '数据检查完成')
                }
              >
                <Stethoscope />
                检查与整理数据
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.electronAPI.openDataPath(dataPath)}
              >
                <FolderOpen />
                打开数据文件夹
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.electronAPI.send('openDataSyncWindow')}
              >
                <Cloud />
                数据同步设置
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>当前数据文件夹</Label>
              <Input readOnly value={dataPath} className="font-mono text-xs" />
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await window.electronAPI.browseDataFile();
                    if (res.success) toast.info('路径已更新', res.message);
                    else toast.error('操作取消', res.message);
                  }}
                >
                  <Database />
                  更换数据路径
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await window.electronAPI.resetDataFile();
                    if (res.success) toast.info('已恢复默认路径', res.message);
                    else toast.error('操作失败', res.message);
                  }}
                >
                  <RotateCcw />
                  恢复默认路径
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">切换路径后应用会自动重启。</p>
            </div>
          </CardContent>
        </Card>

        {/* 祈愿工具 */}
        <Card>
          <CardHeader>
            <CardTitle>祈愿工具</CardTitle>
            <CardDescription>常驻配置与抽卡链接获取</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="secondary"
              className="justify-start"
              onClick={() =>
                run('common', () => window.electronAPI.invoke('open-common-items'), '已在默认编辑器中打开')
              }
            >
              <FileJson />
              编辑 commonItems.json
            </Button>
            <p className="text-xs text-muted-foreground">
              可在此修改常驻角色/武器数据，支持简体、繁体等语言设置，保存后自动生效。
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy === 'hsr'}
                onClick={async () => {
                  setBusy('hsr');
                  try {
                    const res = (await window.electronAPI.invoke('getStarRailUrl')) as {
                      success: boolean;
                      message?: string;
                      url?: string;
                    };
                    if (res.success) {
                      await navigator.clipboard.writeText(res.url ?? '');
                      toast.success('崩铁抽卡链接已复制');
                    } else {
                      toast.error('获取失败', res.message);
                    }
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Link2 />
                获取崩铁抽卡链接
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy === 'genshin'}
                onClick={async () => {
                  setBusy('genshin');
                  try {
                    const res = (await window.electronAPI.invoke('getGenshinWishLink')) as {
                      success: boolean;
                      message?: string;
                      url?: string;
                    };
                    if (res.success) {
                      await navigator.clipboard.writeText(res.url ?? '');
                      toast.success('原神祈愿链接已复制');
                    } else {
                      toast.error('获取失败', res.message);
                    }
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Link2 />
                获取原神祈愿链接
              </Button>
            </div>
          </CardContent>
        </Card>

          {/* 米游社账号 */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
            <CardTitle>米游社账号</CardTitle>
              <CardDescription>
                登录后原神 / 千星奇域 / 绝区零 可免启动游戏换取抽卡链接；未登录时自动回退到缓存抓取。
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => setQrOpen(true)}>
                <QrCode />
                扫码登录
              </Button>
              {mhy?.loggedIn && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run('logout', () => window.electronAPI.invoke('mhy-logout'), '已退出登录').then(
                      refreshMhy,
                    )
                  }
                >
                  <LogOut />
                  退出
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" onClick={refreshMhy} aria-label="刷新状态">
                <RefreshCw />
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {mhy?.loggedIn ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm">
                  已登录：<span className="font-medium">{mhy.nickname || mhy.accountId}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    米游社 UID {mhy.accountId}
                    {mhy.updated ? ` · ${mhy.updated}` : ''}
                  </span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(mhy.games ?? {}).map(([key, g]) => (
                    <div key={key} className="glass-sheen rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{g.label}</span>
                        <Badge variant={g.cookieSupported ? 'success' : 'warning'}>
                          {g.cookieSupported ? '免启动' : '走缓存'}
                        </Badge>
                      </div>
                      {g.candidates.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">账号下没有该游戏角色</p>
                      ) : (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {g.candidates.map((c) => (
                            <li key={c.uid} className="flex items-center justify-between gap-2 text-xs">
                              <span className="tabular-nums truncate">
                                {c.uid} · {c.regionName} · Lv.{c.level}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() =>
                                  run(
                                    'pick',
                                    () =>
                                      window.electronAPI.invoke(
                                        'mhy-set-preferred-uid',
                                        key,
                                        c.uid,
                                      ),
                                    `${g.label} 已选用 UID ${c.uid}`,
                                  ).then(refreshMhy)
                                }
                              >
                                选用
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                未登录米游社账号
              {mhy?.message ? `（${mhy.message}）` : ''}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <MhyQrDialog open={qrOpen} onOpenChange={setQrOpen} onSuccess={refreshMhy} />

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>恢复默认背景配置？</DialogTitle>
            <DialogDescription>
              这会清空当前壁纸路径并把遮罩强度复位为 50%。这里只保存了路径本身，
              不会复制图片文件，所以撤销后需要手动重新选择图片。
            </DialogDescription>
          </DialogHeader>
          {settings.backgroundImage && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              将被清除：{settings.backgroundImage}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestoreOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setRestoreOpen(false);
                await restoreDefault();
                toast.success('已恢复默认背景');
              }}
            >
              <RotateCcw />
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------ 米游社扫码 */

function MhyQrDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [status, setStatus] = useState('正在生成二维码…');
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setStatus('正在生成二维码…');
    const created = (await window.electronAPI.invoke('mhy-login-create-qr')) as {
      success: boolean;
      message?: string;
      ticket: string;
      qrDataUrl: string;
    };
    if (!created.success) {
      setStatus(`创建二维码失败：${created.message}`);
      return;
    }
    setQr(created.qrDataUrl);
    setStatus('等待扫码…');

    let expiredOnce = false;
    const poll = async () => {
      try {
        const r = (await window.electronAPI.invoke('mhy-login-poll', created.ticket)) as {
          success: boolean;
          status?: string;
          message?: string;
          expired?: boolean;
          nickname?: string;
          accountId?: string;
        };
        if (!r.success) {
          if (r.expired && !expiredOnce) {
            expiredOnce = true;
            stop();
            await start();
            return;
          }
          setStatus(`查询失败：${r.message}`);
          return;
        }
        if (r.status === 'Scanned') setStatus('已扫码，请在手机上确认…');
        if (r.status === 'Confirmed') {
          stop();
          toast.success(`登录成功：${r.nickname || r.accountId}`);
          onOpenChange(false);
          onSuccess();
        }
      } catch (err) {
        setStatus(`轮询异常：${err instanceof Error ? err.message : String(err)}`);
      }
    };
    timer.current = window.setInterval(poll, 1500);
    void poll();
  }, [onOpenChange, onSuccess, stop, toast]);

  useEffect(() => {
    if (open) void start();
    else {
      stop();
      setQr('');
    }
    return stop;
  }, [open, start, stop]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs text-center">
        <DialogHeader>
          <DialogTitle>请使用米游社 App 扫码</DialogTitle>
          <DialogDescription>仅用于登录米游社账号，与游戏账号无关</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          {qr ? (
            <img src={qr} alt="登录二维码" className="size-56 rounded-lg bg-white p-1" />
          ) : (
            <div className="grid size-56 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">
              加载中…
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{status}</p>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
