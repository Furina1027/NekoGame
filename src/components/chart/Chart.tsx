import { useEffect, useLayoutEffect, useRef } from 'react';
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
} from 'chart.js';import { useTheme } from '@/hooks/useTheme';

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
    /**
     * 强制重播一次「从 0 长到实际值」的动画。
     * 刷新数据时重算结果常常与原值完全一致（时长只在会话结束时增加），
     * 光看内容变化是察觉不到的，需要调用方显式推进这个信号。
     */
    swapKey?: number;
  };
}[ChartType];

const BASE_OPTIONS = { responsive: true, maintainAspectRatio: false } as const;

/**
 * 调用方几乎都写成 data={{...}} options={{...}}，每次渲染都是新对象。
 * 若按引用比较，父组件每渲染一次就会重建图表实例——画布被清空、入场动画重放，
 * 表现为「点一下刷新数据，卡片里的图闪一两下」。这里改用值比较：
 * 内容没变就完全不碰图表。
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

interface Applied {
  type: ChartType;
  data: unknown;
  options: unknown;
  colors: unknown;
}

/**
 * 不传 animation:false —— Chart.js 自带的入场动画（柱子从 0 长到实际值、
 * 折线从底部画出）正是我们要的观感。
 * 之前在这里关掉它，结果命中缓存直接建图时（切回看过的游戏）就没有动画了。
 */
function toConfig(next: Applied) {
  return {
    type: next.type,
    data: next.data as ChartData,
    options: { ...BASE_OPTIONS, ...(next.options as ChartOptions | undefined) },
  } as ChartConfiguration;
}

/**
 * Chart.js 的薄封装。
 * 实例只在挂载时创建一次（容器宽度为 0 时推迟到 ResizeObserver 报到尺寸再建），
 * 之后数据变化走 chart.update() 原地更新，不清空画布。
 */
export function Chart({ type, data, options, height = 260, className, swapKey }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const appliedRef = useRef<Applied | null>(null);
  const { colors } = useTheme();

  // 建图时需要读到最新的 props，所以用 ref 透传，避免把实例生命周期绑到数据上
  const latest = useRef<Applied>({ type, data, options, colors });
  latest.current = { type, data, options, colors };

  // 生命周期：创建一次 + 监听容器尺寸，卸载时销毁。
  // 用 useLayoutEffect 而不是 useEffect：后者在浏览器已经画出空白画布之后才跑，
  // 切换面板时仍会看到一闪空白；前者同步执行，首帧就带上内容。
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let disposed = false;

    const ensureChart = () => {
      if (disposed || chartRef.current || wrap.clientWidth === 0) return;
      const l = latest.current;
      chartRef.current = new ChartJS(canvas, toConfig(l));
      appliedRef.current = l;
    };

    ensureChart();

    // 在隐藏的 Tab 里挂载时容器宽度是 0，Chart.js 会把 0x0 缓存下来，
    // 切回该 Tab 也不重绘；等容器真的有尺寸了再建图。
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      if (chartRef.current) chartRef.current.resize();
      else ensureChart();
    });
    observer.observe(wrap);

    return () => {
      disposed = true;
      observer.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
      appliedRef.current = null;
    };
  }, []);

  // 数据同步：内容真的变了才动图表；swapKey 推进时即使数值相同也要重播一次动画
  const lastSwapKey = useRef<number | undefined>(undefined);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return; // 还没建出来，上面 ensureChart 会用 latest 补上
    const next = latest.current;
    const prev = appliedRef.current;

    // 刷新信号：跳过首次，只在真正推进时算「强制重播」
    const forced =
      swapKey !== undefined &&
      lastSwapKey.current !== undefined &&
      lastSwapKey.current !== swapKey;
    lastSwapKey.current = swapKey;

    if (
      !forced &&
      prev &&
      prev.type === next.type &&
      prev.colors === next.colors &&
      sameValue(prev.data, next.data) &&
      sameValue(prev.options, next.options)
    ) {
      return;
    }

    if (prev && prev.type === next.type) {
      // 同类型：原地更新。Chart.js 每次 update 都会重跑「从 0 长到实际值」，
      // 所以数值没变时也会重播——这正是刷新时想要的反馈。
      chart.data = next.data as ChartData;
      chart.options = { ...BASE_OPTIONS, ...(next.options as ChartOptions | undefined) };
      chart.update();
    } else {
      // 图表类型变了才需要重建
      chart.destroy();
      chartRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) chartRef.current = new ChartJS(canvas, toConfig(next));
    }
    appliedRef.current = next;
  }, [type, data, options, colors, swapKey]);

  return (
    <div ref={wrapRef} className={className} style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export type { DefaultDataPoint };
