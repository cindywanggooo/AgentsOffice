import type { OfficeAgent } from "./types";

/** 與 app/office/cindy/agents.py 的 LOCAL_ACKS 保持同一段話。 */
export const LOCAL_ACKS: Record<string, string> = {
  amy: "收到，已記入今天的待辦，狀態是待命。信件和自媒體這類的事可以交給我。",
  lily: "收到，先記在今天。AI 新技術和文章，我會照這個題目來查、來寫。",
  ken: "了解，先掛在待命。我可以幫忙看資安風險和防護，但不會提供入侵或攻擊步驟。",
  ivy: "收到，美編的事先放在我桌上。你可以隨時把狀態改成進行中或完成。",
  maggie: "已排進今天的進度。每位同事的待命、進行中、完成，都會留在當天的紀錄裡。",
};

export const CINDY_AGENTS: OfficeAgent[] = [
  {
    slug: "amy",
    display_name: "Amy",
    role: "信件回覆、自媒體經紀人",
    color: "#e45c97",
    wall: "#ffe0f0",
    accent: "#e45c97",
    placeholder: "回覆合作信",
  },
  {
    slug: "lily",
    display_name: "Lily",
    role: "研究最新 AI 科技與應用、文章寫手",
    color: "#7c5cbf",
    wall: "#efe6ff",
    accent: "#7c5cbf",
    placeholder: "本週 AI 新聞",
  },
  {
    slug: "ken",
    display_name: "Ken",
    role: "資工、資安工具人",
    color: "#2f6f9f",
    wall: "#e3f2ff",
    accent: "#2f6f9f",
    placeholder: "檢查登入風險",
  },
  {
    slug: "ivy",
    display_name: "Ivy",
    role: "美編設計師",
    color: "#e08a2c",
    wall: "#fff0dc",
    accent: "#e08a2c",
    placeholder: "活動主視覺",
  },
  {
    slug: "maggie",
    display_name: "Maggie",
    role: "專案管理師",
    color: "#2f8f4e",
    wall: "#e5f8e4",
    accent: "#2f8f4e",
    placeholder: "本週里程碑",
  },
];

export function findAgent(slug: string): OfficeAgent {
  return CINDY_AGENTS.find((agent) => agent.slug === slug) ?? CINDY_AGENTS[0];
}
