import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** 出错时展示的区域名称 */
  label?: string;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * 单个页面崩溃时兜住它，不让整棵组件树被卸载。
 * 没有这层的话，任何一处渲染异常都会导致整个窗口永久黑屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? '页面'}] 渲染异常:`, error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="size-7 text-warning" />
        <div>
          <p className="font-medium">
            {this.props.label ?? '这个页面'}出了点问题，其余功能不受影响
          </p>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={this.reset}>
            <RefreshCw />
            重试
          </Button>
        </div>
        {info && (
          <details className="mt-2 max-w-2xl text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">调用栈</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-surface-sunken p-2 text-[10px] whitespace-pre-wrap text-muted-foreground">
              {info}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
