import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const WINDOW_TITLE = 'Neko Game';

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'app-no-drag grid h-10 w-11 place-items-center text-muted-foreground transition-colors duration-150',
        'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        danger && 'hover:bg-red-600 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI.isMaximized().then(setMaximized).catch(() => {});
    return window.electronAPI.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <header className="app-drag relative z-30 flex h-10 shrink-0 items-stretch justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">
        <span className="text-[13px] font-medium text-muted-foreground">{WINDOW_TITLE}</span>
      </div>

      <div className="flex shrink-0">
        <WindowButton label="最小化" onClick={() => window.electronAPI.minimizeWindow()}>
          <Minus className="size-4" strokeWidth={1.75} />
        </WindowButton>
        <WindowButton
          label={maximized ? '向下还原' : '最大化'}
          onClick={() => window.electronAPI.maximizeWindow()}
        >
          {maximized ? (
            <Copy className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Square className="size-3.5" strokeWidth={1.75} />
          )}
        </WindowButton>
        <WindowButton label="关闭" danger onClick={() => window.electronAPI.closeWindow()}>
          <X className="size-4" strokeWidth={1.75} />
        </WindowButton>
      </div>
    </header>
  );
}
