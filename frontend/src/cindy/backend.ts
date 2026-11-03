/**
 * 辛蒂辦公室的儲存接點。
 *
 * OfficeBackend 對應後端的 AgentWorkAdapter（app/office/cindy/adapter.py）：
 * - BrowserOfficeBackend：靜態網站（GitHub Pages、Vercel）用這個。
 *   任務存在這台瀏覽器的 localStorage，重新整理還在，不會上傳，也不會呼叫模型。
 * - ServerOfficeBackend：同一個網域有 FastAPI 時使用。
 *   伺服器若設定了模型與 API Key，才會把任務送給既有的 run_agent。
 *
 * 公開網站不要設定 VITE_OFFICE_API，也不要把 API Key 打進前端。
 */
import { CINDY_AGENTS, LOCAL_ACKS } from "./agents";
import type {
  ChatMessage,
  CreateTaskInput,
  HealthInfo,
  OfficeAgent,
  OfficeTask,
  SendChatInput,
  TaskStatus,
} from "./types";

export interface OfficeBackend {
  readonly id: "browser" | "server";
  listAgents(): Promise<OfficeAgent[]>;
  listTasks(day?: string): Promise<OfficeTask[]>;
  listMessages(agentSlug?: string): Promise<ChatMessage[]>;
  createTask(input: CreateTaskInput): Promise<OfficeTask>;
  updateTask(taskId: string, status: TaskStatus): Promise<OfficeTask>;
  deleteTask(taskId: string): Promise<void>;
  sendChat(input: SendChatInput): Promise<void>;
}

const STORAGE_KEY = "cindy-office-v1";

interface Bucket {
  tasks: OfficeTask[];
  messages: ChatMessage[];
}

function emptyBucket(): Bucket {
  return { tasks: [], messages: [] };
}

function nid(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadBucket(): Bucket {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyBucket();
    const parsed = JSON.parse(raw) as Bucket;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.messages)) {
      return emptyBucket();
    }
    return parsed;
  } catch {
    return emptyBucket();
  }
}

function saveBucket(bucket: Bucket): void {
  bucket.tasks = bucket.tasks.slice(-1000);
  bucket.messages = bucket.messages.slice(-400);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bucket));
  } catch {
    throw new Error("無法寫入瀏覽器儲存。請檢查是否封鎖了網站資料。");
  }
}

function ackFor(slug: string): string {
  return LOCAL_ACKS[slug] ?? "收到，已記入今日進度，狀態是待命。";
}

export class BrowserOfficeBackend implements OfficeBackend {
  readonly id = "browser" as const;

  async listAgents(): Promise<OfficeAgent[]> {
    return CINDY_AGENTS;
  }

  async listTasks(day?: string): Promise<OfficeTask[]> {
    return loadBucket()
      .tasks.filter((task) => !day || task.day === day)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listMessages(agentSlug?: string): Promise<ChatMessage[]> {
    return loadBucket()
      .messages.filter((message) => !agentSlug || message.agent_slug === agentSlug)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createTask(input: CreateTaskInput): Promise<OfficeTask> {
    const bucket = loadBucket();
    const task: OfficeTask = {
      task_id: nid("task"),
      agent_slug: input.agent_slug,
      title: input.title.trim(),
      day: input.day,
      status: "idle",
      result: "",
      backend: "browser",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    bucket.tasks.push(task);
    bucket.messages.push(
      {
        message_id: nid("msg"),
        agent_slug: input.agent_slug,
        role: "user",
        content: task.title,
        day: input.day,
        task_id: task.task_id,
        backend: "user",
        created_at: nowIso(),
      },
      {
        message_id: nid("msg"),
        agent_slug: input.agent_slug,
        role: "agent",
        content: ackFor(input.agent_slug),
        day: input.day,
        task_id: task.task_id,
        backend: "browser",
        created_at: nowIso(),
      },
    );
    saveBucket(bucket);
    return task;
  }

  async updateTask(taskId: string, status: TaskStatus): Promise<OfficeTask> {
    const bucket = loadBucket();
    const task = bucket.tasks.find((item) => item.task_id === taskId);
    if (!task) throw new Error("找不到這項任務");
    task.status = status;
    task.updated_at = nowIso();
    saveBucket(bucket);
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    const bucket = loadBucket();
    bucket.tasks = bucket.tasks.filter((task) => task.task_id !== taskId);
    saveBucket(bucket);
  }

  async sendChat(input: SendChatInput): Promise<void> {
    const bucket = loadBucket();
    const content = input.content.trim();
    let taskId: string | null = null;
    if (input.create_task) {
      const title = content.length > 80 ? `${content.slice(0, 80)}…` : content;
      const task: OfficeTask = {
        task_id: nid("task"),
        agent_slug: input.agent_slug,
        title,
        day: input.day,
        status: "idle",
        result: "",
        backend: "browser",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      bucket.tasks.push(task);
      taskId = task.task_id;
    }
    bucket.messages.push(
      {
        message_id: nid("msg"),
        agent_slug: input.agent_slug,
        role: "user",
        content,
        day: input.day,
        task_id: taskId,
        backend: "user",
        created_at: nowIso(),
      },
      {
        message_id: nid("msg"),
        agent_slug: input.agent_slug,
        role: "agent",
        content: ackFor(input.agent_slug),
        day: input.day,
        task_id: taskId,
        backend: "browser",
        created_at: nowIso(),
      },
    );
    saveBucket(bucket);
  }
}

function apiRoot(): string {
  const configured = import.meta.env.VITE_OFFICE_API as string | undefined;
  return (configured || "").replace(/\/$/, "");
}

async function readData<T>(res: Response): Promise<T> {
  let body: { data?: T; detail?: unknown } | null = null;
  try {
    body = (await res.json()) as { data?: T; detail?: unknown };
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : "辦公室後端沒有回應");
  }
  return body?.data as T;
}

export class ServerOfficeBackend implements OfficeBackend {
  readonly id = "server" as const;

  private url(path: string): string {
    return `${apiRoot()}/api/v1/office/cindy${path}`;
  }

  async listAgents(): Promise<OfficeAgent[]> {
    const data = await readData<{ agents: OfficeAgent[] }>(await fetch(this.url("/agents")));
    const bySlug = new Map(data.agents.map((agent) => [agent.slug, agent]));
    return CINDY_AGENTS.map((agent) => ({ ...agent, ...bySlug.get(agent.slug) }));
  }

  async listTasks(day?: string): Promise<OfficeTask[]> {
    const query = day ? `?day=${encodeURIComponent(day)}` : "";
    const data = await readData<{ tasks: OfficeTask[] }>(await fetch(this.url(`/tasks${query}`)));
    return data.tasks;
  }

  async listMessages(agentSlug?: string): Promise<ChatMessage[]> {
    const query = agentSlug ? `?agent_slug=${encodeURIComponent(agentSlug)}` : "";
    const data = await readData<{ messages: ChatMessage[] }>(await fetch(this.url(`/messages${query}`)));
    return data.messages;
  }

  async createTask(input: CreateTaskInput): Promise<OfficeTask> {
    const data = await readData<{ task: OfficeTask }>(
      await fetch(this.url("/tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
    return data.task;
  }

  async updateTask(taskId: string, status: TaskStatus): Promise<OfficeTask> {
    const data = await readData<{ task: OfficeTask }>(
      await fetch(this.url(`/tasks/${encodeURIComponent(taskId)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    );
    return data.task;
  }

  async deleteTask(taskId: string): Promise<void> {
    await readData<{ deleted: boolean }>(
      await fetch(this.url(`/tasks/${encodeURIComponent(taskId)}`), { method: "DELETE" }),
    );
  }

  async sendChat(input: SendChatInput): Promise<void> {
    await readData(
      await fetch(this.url("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  }
}

export async function chooseBackend(): Promise<{ backend: OfficeBackend; health: HealthInfo }> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${apiRoot()}/api/v1/office/cindy/health`, { signal: ctrl.signal });
    if (!res.ok) throw new Error("no server");
    const body = (await res.json()) as { data?: { storage?: string; live_agent?: boolean; detail?: string } };
    if (body.data?.storage !== "server") throw new Error("no server");
    return {
      backend: new ServerOfficeBackend(),
      health: {
        storage: "server",
        liveAgent: Boolean(body.data.live_agent),
        detail: body.data.detail || "",
      },
    };
  } catch {
    return {
      backend: new BrowserOfficeBackend(),
      health: {
        storage: "browser",
        liveAgent: false,
        detail: "任務存在這台瀏覽器，重新整理還在；沒有送到真正的 Agent。",
      },
    };
  } finally {
    window.clearTimeout(timer);
  }
}
