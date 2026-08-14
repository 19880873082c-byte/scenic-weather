export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const round = (value: number, digits = 0) => Number(value.toFixed(digits));

export function average(values: (number | null | undefined)[]): number {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

export function dateDistance(date: string, base = new Date()): number {
  const target = new Date(`${date}T12:00:00+08:00`);
  const today = new Date(base.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

export function addMinutes(iso: string, minutes: number): string {
  const date = new Date(`${iso}:00+08:00`);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
}
