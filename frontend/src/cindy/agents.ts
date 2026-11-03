import type { OfficeAgent } from "./types";

/** 與 app/office/cindy/agents.py 的 LOCAL_ACKS 保持同一段話。 */
export const LOCAL_ACKS: Record<string, string> = {
  amy: "收到，已記入今天的待辦，狀態是待命。信件和自媒體這類的事可以交給我。",
  lily: "收到，先記在今天。AI 新技術和文章，我會照這個題目來查、來寫。",
  ken: "了解，先掛在待命。我可以幫忙看資安風險和防護，但不會提供入侵或攻擊步驟。",
  ivy: "收到，美編的事先放在我桌上。你可以隨時把狀態改成進行中或完成。",
  maggie: "收到。我是主管，會先把事情派給合適的同事，完成後再向總經理回報。",
};

export const CINDY_AGENTS: OfficeAgent[] = [
  {
    slug: "amy",
    display_name: "Amy",
    role: "信件回覆、自媒體經紀人",
    color: "#ff4f9a",
    wall: "#2a1422",
    accent: "#ff4f9a",
    placeholder: "回覆合作信",
  },
  {
    slug: "lily",
    display_name: "Lily",
    role: "研究最新 AI 科技與應用、文章寫手",
    color: "#b388ff",
    wall: "#1c1430",
    accent: "#b388ff",
    placeholder: "本週 AI 新聞",
  },
  {
    slug: "ken",
    display_name: "Ken",
    role: "資工、資安工具人",
    color: "#3ee0ff",
    wall: "#102430",
    accent: "#3ee0ff",
    placeholder: "檢查登入風險",
  },
  {
    slug: "ivy",
    display_name: "Ivy",
    role: "美編設計師",
    color: "#ffb020",
    wall: "#2a1c10",
    accent: "#ffb020",
    placeholder: "活動主視覺",
  },
  {
    slug: "maggie",
    display_name: "Maggie",
    role: "主管",
    color: "#3dff9a",
    wall: "#102418",
    accent: "#3dff9a",
    placeholder: "本週里程碑",
  },
];

export const CINDY_GM: OfficeAgent = {
  slug: "cindy",
  display_name: "Cindy",
  role: "總經理",
  color: "#ffd56a",
  wall: "#2a220f",
  accent: "#ffd56a",
  placeholder: "",
};

export function findAgent(slug: string): OfficeAgent {
  if (slug === "cindy") return CINDY_GM;
  return CINDY_AGENTS.find((agent) => agent.slug === slug) ?? CINDY_AGENTS[0];
}
