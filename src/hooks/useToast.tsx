import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

export interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = ++seq;
      setItems((prev) => [...prev.slice(-3), { id, kind, title, description }]);
      const timer = window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3200);
      timers.current.push(timer);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-100 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'glass glass-sheen pointer-events-auto flex items-start gap-2.5 rounded-xl p-3 shadow-xl shadow-black/25',
              'animate-in slide-in-from-bottom-2 duration-300',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
            {t.kind === 'error' && <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
            {t.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-primary" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
