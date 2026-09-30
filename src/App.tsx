import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TitleBar } from '@/components/layout/TitleBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageFallback } from '@/components/common/PageFallback';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/hooks/useToast';
import { useBackground } from '@/hooks/useBackground';

const HomePage = lazy(() => import('@/pages/HomePage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const ToolsPage = lazy(() => import('@/pages/ToolsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const GachaPage = lazy(() => import('@/pages/gacha/GachaPage'));

export default function App() {
  const { imageUrl, settings } = useBackground();

  return (
    <TooltipProvider>
      <ToastProvider>
        {/* 背景分三层：底色 -> 壁纸（带模糊与遮罩强度）-> 渐变遮罩 */}
        <div className="fixed inset-0 -z-30 bg-background" />
        {imageUrl && (
          <div
            className="app-wallpaper fixed inset-0 -z-20 scale-105 bg-cover bg-center bg-no-repeat"
            style={
              {
                backgroundImage: `url("${imageUrl}")`,
                // --dim 由设置页滑块给出，--scrim-min / --dim-gain 在 CSS 里兜底
                '--dim': settings.backgroundOpacity,
              } as React.CSSProperties
            }
          />
        )}
        <div
          className="app-scrim pointer-events-none fixed inset-0 -z-10"
          style={
            {
              opacity: imageUrl ? 1 : 0,
              background: 'var(--scrim)',
            } as React.CSSProperties
          }
        />

        <div className="flex h-full flex-col">
          <TitleBar />
          <div className="flex min-h-0 flex-1 gap-3 pr-3 pb-3">
            <Sidebar />
            <main
              className="panel-scroll glass-sheen min-w-0 flex-1 overflow-hidden rounded-2xl"
              style={{ background: 'var(--panel-bg)' }}
            >
              <ScrollArea className="h-full">
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route
                      path="/"
                      element={
                        <ErrorBoundary label="主页">
                          <HomePage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/library"
                      element={
                        <ErrorBoundary label="游戏库">
                          <LibraryPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/tools"
                      element={
                        <ErrorBoundary label="游戏工具">
                          <ToolsPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/tools/:gameId"
                      element={
                        <ErrorBoundary label="抽卡分析">
                          <GachaPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ErrorBoundary label="设置">
                          <SettingsPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ScrollArea>
            </main>
          </div>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
