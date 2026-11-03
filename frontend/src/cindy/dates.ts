import type { ChatMessage, DaySummary, OfficeTask } from "./types";

export function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function shiftDay(iso: string, delta: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function collectDays(tasks: OfficeTask[], messages: ChatMessage[]): DaySummary[] {
  const map = new Map<string, DaySummary>();
  const ensure = (day: string) => {
    let row = map.get(day);
    if (!row) {
      row = { day, total: 0, idle: 0, doing: 0, done: 0 };
      map.set(day, row);
    }
    return row;
  };
  for (const task of tasks) {
    const row = ensure(task.day);
    row.total += 1;
    row[task.status] += 1;
  }
  for (const message of messages) {
    ensure(message.day);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
