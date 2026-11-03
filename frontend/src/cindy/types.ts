export type TaskStatus = "idle" | "doing" | "done";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  idle: "待命",
  doing: "進行中",
  done: "完成",
};

export interface OfficeAgent {
  slug: string;
  display_name: string;
  role: string;
  color: string;
  wall: string;
  accent: string;
  placeholder: string;
}

export interface OfficeTask {
  task_id: string;
  agent_slug: string;
  title: string;
  day: string;
  status: TaskStatus;
  result: string;
  backend: string;
  via_maggie: boolean;
  needs_you: boolean;
  acked: boolean;
  created_at: string;
  updated_at: string;
}

export interface OfficeEvent {
  event_id: string;
  day: string;
  text: string;
  kind: string;
  created_at: string;
}

export interface ChatMessage {
  message_id: string;
  agent_slug: string;
  role: "user" | "agent";
  content: string;
  day: string;
  task_id?: string | null;
  backend: string;
  created_at: string;
}

export interface DaySummary {
  day: string;
  total: number;
  idle: number;
  doing: number;
  done: number;
}

export interface HealthInfo {
  storage: "browser" | "server";
  liveAgent: boolean;
  detail: string;
}

export interface CreateTaskInput {
  agent_slug: string;
  title: string;
  day: string;
  via_maggie?: boolean;
}

export interface TaskPatch {
  status?: TaskStatus;
  needs_you?: boolean;
  acked?: boolean;
}

export interface SendChatInput {
  agent_slug: string;
  content: string;
  day: string;
  create_task: boolean;
}
