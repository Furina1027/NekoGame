import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/common/Primitives';
import { GACHA_LIST } from './gacha/config';
import { cn } from '@/lib/utils';

export default function ToolsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <PageHeader
        title="游戏工具"
        description="一键获取并分析各游戏的抽卡记录"
      />

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {GACHA_LIST.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => navigate(`/tools/${game.id}`)}
            className={cn(
              'glass glass-sheen group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl p-5 text-left',
              'transition-all duration-300 ease-[var(--ease-out-expo)]',
              'hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/25',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <span
              className="absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100"
              style={{ background: game.accent }}
              aria-hidden
            />
            <span
              className="grid size-11 place-items-center rounded-xl transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:scale-110"
              style={{ background: `color-mix(in oklch, ${game.accent} 18%, transparent)`, color: game.accent }}
            >
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">{game.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{game.subtitle}</p>
            </div>
            <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              进入
              <ChevronRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
