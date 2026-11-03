import { findAgent } from "./agents";
import type { OfficeTask } from "./types";

export type Presence = "thinking" | "working" | "meeting" | "needs" | "idle";

export const PRESENCE_LABEL: Record<Presence, string> = {
  thinking: "思考中",
  working: "工作中",
  meeting: "開會中",
  needs: "需要你",
  idle: "閒置",
};

export const WORKERS = ["amy", "lily", "ken", "ivy", "maggie"] as const;

const RULES: Array<[string, string[]]> = [
  ["amy", ["信", "社群", "貼文", "合作", "回覆", "自媒體", "mail"]],
  ["ivy", ["設計", "視覺", "美編", "主視覺", "海報"]],
  ["ken", ["資安", "工程", "程式", "登入", "風險", "技術", "安全"]],
  ["lily", ["ai", "研究", "文章", "新聞", "寫", "科技"]],
  ["maggie", ["專案", "里程碑", "排程", "進度", "會議"]],
];

export function dispatchWorker(title: string, target: string): string {
  if (target !== "auto") return target;
  const text = title.toLowerCase();
  for (const [slug, keys] of RULES) {
    if (keys.some((key) => text.includes(key))) return slug;
  }
  return "maggie";
}

export function meetingWith(title: string, self: string): string | null {
  const text = title.toLowerCase();
  if (text.includes("開會") || text.includes("同步") || text.includes("一起")) return "meet";
  for (const slug of WORKERS) {
    if (slug === self) continue;
    if (text.includes(slug) || text.includes(findAgent(slug).display_name.toLowerCase())) return slug;
  }
  return null;
}

function openTasks(tasks: OfficeTask[], day: string, slug: string): OfficeTask[] {
  return tasks.filter((task) => task.day === day && task.agent_slug === slug && task.status !== "done");
}

export function presenceFor(slug: string, tasks: OfficeTask[], day: string): Presence {
  const waiting = tasks.some((task) => task.day === day && task.needs_you && !task.acked);
  if (slug === "cindy") return waiting ? "needs" : "idle";
  if (slug === "maggie" && waiting) return "needs";
  const mine = openTasks(tasks, day, slug);
  if (mine.some((task) => meetingWith(task.title, slug))) return "meeting";
  if (mine.some((task) => task.status === "doing")) return "working";
  if (mine.some((task) => task.status === "idle")) return "thinking";
  return "idle";
}

export function spotFor(slug: string, tasks: OfficeTask[], day: string, walk?: string): string {
  if (walk) return walk;
  if (slug === "cindy") return "cindy";
  const presence = presenceFor(slug, tasks, day);
  if (slug === "maggie" && presence === "needs") return "cindy";
  if (presence === "meeting") return "meet";
  if (presence === "working" || presence === "thinking") {
    return slug === "maggie" ? "maggieOffice" : slug;
  }
  if (slug === "ken") return "kitchen";
  if (slug === "ivy") return "lounge";
  return "lounge";
}

export function taipeiHour(): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return Number(hour);
}

export function resolveTod(choice: "now" | "day" | "dusk" | "night"): "day" | "dusk" | "night" {
  if (choice !== "now") return choice;
  const hour = taipeiHour();
  if (hour >= 6 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "dusk";
  return "night";
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
