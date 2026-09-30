import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.locale('zh-cn');

/** 秒 -> "12 小时 34 分"，用于概览卡片 */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  if (total === 0) return '0 分钟';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  if (m > 0) return `${m} 分钟`;
  return `${total} 秒`;
}

/** 秒 -> "12.3h"，用于排行榜与紧凑位置 */
export function formatHours(seconds: number | null | undefined): string {
  return `${((seconds ?? 0) / 3600).toFixed(1)}h`;
}

/** 秒 -> "1:23:45" / "23:45" */
export function formatClock(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('MM-DD') : String(value);
}

export function fromNow(value: string | null | undefined): string {
  if (!value) return '从未游玩';
  const d = dayjs(value);
  return d.isValid() ? d.fromNow() : String(value);
}

/** 字节 -> "1.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
