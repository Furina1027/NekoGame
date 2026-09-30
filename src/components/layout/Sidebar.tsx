import { NavLink } from 'react-router-dom';
import { Home, Library, Wrench, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '主页', icon: Home },
  { to: '/library', label: '游戏库', icon: Library },
  { to: '/tools', label: '游戏工具', icon: Wrench },
  { to: '/settings', label: '设置', icon: Settings },
];

export function Sidebar() {
  return (
    <nav
      className="panel-frost glass-sheen flex w-52 shrink-0 flex-col gap-1 overflow-hidden rounded-2xl p-3"
      style={{ background: 'var(--sidebar-bg)' }}
      aria-label="主导航"
    >
      <div className="mb-4 flex items-center gap-2.5 px-2 pt-1 pb-2">
        <img
          src="./assets/app-icon.png"
          alt="Neko Game"
          className="size-9 shrink-0 rounded-xl object-contain"
        />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">Neko Game</div>
          <div className="truncate text-[11px] text-muted-foreground">抽卡与时长分析</div>
        </div>
      </div>

      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 ease-[var(--ease-out-expo)]',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isActive
                ? 'bg-surface-raised text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200 ease-[var(--ease-out-expo)]',
                  isActive ? 'opacity-100' : 'scale-y-0 opacity-0',
                )}
              />
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
