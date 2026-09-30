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
  const busyTimer = useRef<number | null>(null);

  useEffect(() => {
    const off = window.electronAPI.on('syncSettingsStatus', (next: Status) => {
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

  const run = (channel: string, id: string, payload?: unknown) => {
    setBusy(id);
    setStatus(null);
    busyTimer.current = window.setTimeout(() => setBusy(null), 60_000);
    if (payload) window.electronAPI.send(channel, payload);
    else window.electronAPI.send(channel);
  };

  const canSubmit = repoUrl.trim().length > 0 && token.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <h1 className="text-sm font-semibold">数据同步设置</h1>
        <button
          type="button"
          onClick={() => window.electronAPI.send('closeDataSyncWindow')}
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
            令牌会以 AES-256-CBC 加密后保存在本地，仅用于读写你的数据仓库。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={!canSubmit || busy !== null}
            onClick={() => run('saveSyncSettings', 'save', { repoUrl: repoUrl.trim(), token: token.trim() })}
          >
            {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
            保存设置
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => run('uploadFirstData', 'upload')}
          >
            {busy === 'upload' ? <Loader2 className="animate-spin" /> : <CloudUpload />}
            上传数据
          </Button>
        </div>

        <Button
          variant="outline"
          disabled={!canSubmit || busy !== null}
          onClick={() =>
            run('downloadLastedData', 'download', { repoUrl: repoUrl.trim(), token: token.trim() })
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
          「从云端覆盖本地数据」会用云端版本替换本机的两个数据库文件，请先做好本地备份。
        </p>
      </div>
    </div>
  );
}
