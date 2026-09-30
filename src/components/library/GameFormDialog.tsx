import { useEffect, useState } from 'react';
import { Image as ImageIcon, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { GameDataInput } from '@/types/domain';

type Field = 'icon' | 'poster_vertical' | 'poster_horizontal';

const FIELD_META: Record<Field, { label: string; hint: string; ratio: string }> = {
  icon: { label: '游戏图标', hint: '正方形，建议 256×256 以上', ratio: 'aspect-square' },
  poster_vertical: { label: '游戏海报（竖版）', hint: '竖版，比例约 2:3.5', ratio: 'aspect-[2/3.5]' },
  poster_horizontal: { label: '游戏海报（横版）', hint: '横版，比例约 16:7', ratio: 'aspect-[16/7]' },
};

const DEFAULTS: Record<Field, string> = {
  icon: './assets/app-icon.png',
  poster_vertical: './assets/poster_vertical.webp',
  poster_horizontal: './assets/poster_horizontal.webp',
};

interface GameFormDialogProps {
  open: boolean;
  /** 传入即为编辑模式 */
  initial?: GameDataInput | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: GameDataInput) => Promise<void>;
}

export function GameFormDialog({ open, initial, onOpenChange, onSubmit }: GameFormDialogProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [images, setImages] = useState<Record<Field, string>>(DEFAULTS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setName(initial.name);
      setPath(initial.path);
      setImages({
        icon: initial.icon || DEFAULTS.icon,
        poster_vertical: initial.poster_vertical || DEFAULTS.poster_vertical,
        poster_horizontal: initial.poster_horizontal || DEFAULTS.poster_horizontal,
      });
    } else {
      setName('');
      setPath('');
      setImages(DEFAULTS);
    }
  }, [open, initial]);

  const pick = async (field: Field) => {
    const picked = await window.electronAPI.selectImageFile();
    if (picked) setImages((prev) => ({ ...prev, [field]: picked }));
  };

  const browse = async () => {
    const picked = await window.electronAPI.openFile();
    if (picked) setPath(picked);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('请填写游戏名称');
    if (!path.trim()) return setError('请选择游戏主程序路径');
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        id: initial?.id,
        name: name.trim(),
        path: path.trim(),
        icon: images.icon,
        poster_vertical: images.poster_vertical,
        poster_horizontal: images.poster_horizontal,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑游戏' : '录入新游戏'}</DialogTitle>
          <DialogDescription>
            请填写游戏主程序的路径（通常是「游戏名.exe」），而不是启动器。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid max-h-[52vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
            {(Object.keys(FIELD_META) as Field[]).map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label className="text-xs">{FIELD_META[field].label}</Label>
                <button
                  type="button"
                  onClick={() => pick(field)}
                  className={cn(
                    'group relative w-full overflow-hidden rounded-lg border border-border bg-surface-sunken transition-colors hover:border-primary/50',
                    FIELD_META[field].ratio,
                  )}
                >
                  <img
                    src={window.electronAPI.filePathToURL(images[field])}
                    alt={FIELD_META[field].label}
                    className="size-full object-cover"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <ImageIcon className="size-4 text-white" />
                  </span>
                </button>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {FIELD_META[field].hint}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="game-name">游戏名称</Label>
            <Input
              id="game-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：原神"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="game-path">游戏路径</Label>
            <div className="flex gap-2">
              <Input
                id="game-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="选择游戏主程序"
                readOnly
                className="font-mono text-xs"
              />
              <Button type="button" variant="secondary" onClick={browse} className="shrink-0">
                <FolderOpen />
                浏览
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
            {pending ? '保存中…' : isEdit ? '保存更改' : '录入游戏'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
