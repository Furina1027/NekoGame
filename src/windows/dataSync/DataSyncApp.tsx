import { useEffect, useRef, useState } from 'react';
import { X, CloudUpload, CloudDownload, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Status = { success: boolean; message: string } | null;

export default function DataSyncApp() {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const busyTimer = useRef<number | null>(null);

  // 回显已保存的配置：之前没有读取通道，每次打开窗口都得重新输入
  useEffect(() => {
    void window.electronAPI
      .loadSyncSettings()
      .then((saved) => {
        if (saved) {
          setRepoUrl(saved.repoUrl);
          setToken(saved.token);
          setHasSaved(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const off = window.electronAPI.onSyncSettingsStatus((next) => {
      setStatus(next);
      setBusy(null);
    });
    return off;
  }, []);

  useEffect(
    () => () => {
      if (busyTimer.current) clearTimeout(busyTimer.current);
    },
    [],
  );

  const run = (id: string, fn: () => void) => {
    setBusy(id);
    setStatus(null);
    busyTimer.current = window.setTimeout(() => setBusy(null), 60_000);
    fn();
  };

  const canSubmit = repoUrl.trim().length > 0 && token.trim().length > 0;
  // 从云端覆盖：输入留空时主进程会回退到已保存的配置
  const canDownload = canSubmit || hasSaved;

  return (
    <div className="flex h-full flex-col">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <h1 className="text-sm font-semibold">数据同步设置</h1>
        <button
          type="button"
          onClick={() => window.electronAPI.closeDataSyncWindow()}
          className="app-no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="repoUrl">仓库地址</Label>
          <Input
            id="repoUrl"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/用户名/仓库"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="token">访问令牌</Label>
          <Input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="GitHub / Gitee Personal Access Token"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            令牌会通过系统凭据加密（Windows DPAPI）保存在本地，仅用于读写你的数据仓库。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={!canSubmit || busy !== null}
            onClick={() =>
              run('save', () =>
                window.electronAPI.saveSyncSettings({ repoUrl: repoUrl.trim(), token: token.trim() }),
              )
            }
          >
            {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
            保存设置
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => run('upload', () => window.electronAPI.uploadFirstData())}
          >
            {busy === 'upload' ? <Loader2 className="animate-spin" /> : <CloudUpload />}
            上传数据
          </Button>
        </div>

        <Button
          variant="outline"
          disabled={!canDownload || busy !== null}
          onClick={() =>
            run('download', () =>
              window.electronAPI.downloadLastedData(
                canSubmit ? { repoUrl: repoUrl.trim(), token: token.trim() } : undefined,
              ),
            )
          }
        >
          {busy === 'download' ? <Loader2 className="animate-spin" /> : <CloudDownload />}
          从云端覆盖本地数据
        </Button>

        {status && (
          <p
            className={cn(
              'glass-sheen rounded-lg p-3 text-xs whitespace-pre-wrap',
              status.success ? 'text-success' : 'text-destructive',
            )}
          >
            {status.message}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          「从云端覆盖本地数据」会先自动备份本机数据库（数据文件夹下的 backup 目录），替换后自动重启应用。输入留空时使用已保存的同步设置。
        </p>
      </div>
    </div>
  );
}
