import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  type ChartConfiguration,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ChartType,
  type DefaultDataPoint,
} from 'chart.js';
import { useTheme } from '@/hooks/useTheme';

// Chart.js v4 走 tree-shaking，控制器/刻度/插件必须手动注册
ChartJS.register(
  BarController,
  DoughnutController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Filler,
  Legend,
  Tooltip,
);

ChartJS.defaults.font.family =
  "'Inter var', 'Inter', -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', sans-serif";
ChartJS.defaults.animation = { duration: 400, easing: 'easeOutQuart' };

/** 以 type 为判别式，options 才会收窄到该图表类型的专属配置（如 doughnut 的 cutout） */
export type ChartProps = {
  [K in ChartType]: {
    type: K;
    data: ChartData<K>;
    options?: ChartOptions<K>;
    height?: number;
    className?: string;
  };
}[ChartType];

/**
 * Chart.js 的薄封装。实例随 data/options 变化重建，主题切换时同步刷新，
 * 卸载时销毁，避免 canvas 上下文泄漏。
 */
export function Chart({ type, data, options, height = 260, className }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    // 在隐藏的 Tab 里挂载时容器宽度是 0，此时建图会被 Chart.js 缓存成 0x0，
    // 而且只有第一个卡片能正常显示（后续的 RO 回调发生在建图之前）。
    // 所以宽度为 0 时不建图，等容器真的有尺寸了再建。
    let disposed = false;
    const build = () => {
      if (disposed || chartRef.current || wrap.clientWidth === 0) return;
      chartRef.current = new ChartJS(canvas, {
        type,
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...options,
        },
      } as ChartConfiguration);
    };

    chartRef.current?.destroy();
    chartRef.current = null;
    build();

    const observer = new ResizeObserver(() => {
      if (disposed) return;
      if (chartRef.current) chartRef.current.resize();
      else build();
    });
    observer.observe(wrap);

    return () => {
      disposed = true;
      observer.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // colors 参与依赖，主题切换时重建图表
  }, [type, data, options, colors]);

  return (
    <div ref={wrapRef} className={className} style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export type { DefaultDataPoint };
