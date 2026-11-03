import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CINDY_AGENTS, findAgent } from "./agents";
import { chooseBackend } from "./backend";
import type { OfficeBackend } from "./backend";
import { AgentFace } from "./characters";
import { collectDays, formatDay, shiftDay, taipeiToday } from "./dates";
import { Pomodoro } from "./Pomodoro";
import { STATUS_LABEL } from "./types";
import type { ChatMessage, HealthInfo, OfficeTask, TaskStatus } from "./types";

interface ViewState {
  day: string;
  agent: string;
}

function loadView(): ViewState {
  const today = taipeiToday();
  try {
    const raw = sessionStorage.getItem("cindy-office-view");
    if (!raw) return { day: today, agent: "amy" };
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    return {
      day: typeof parsed.day === "string" ? parsed.day : today,
      agent: typeof parsed.agent === "string" ? parsed.agent : "amy",
    };
  } catch {
    return { day: today, agent: "amy" };
  }
}

function storageSentence(health: HealthInfo): string {
  if (health.storage === "browser") {
    return "任務存在這台瀏覽器，重新整理還在；沒有送到真正的 Agent。";
  }
  if (health.liveAgent) {
    return "任務會寫入辦公室伺服器，並送給這位同事的模型。";
  }
  return "任務存在辦公室伺服器的資料檔。還沒設定模型，所以只會記下來，不會請 Agent 做事。";
}

export function CindyOffice() {
  const initial = loadView();
  const today = taipeiToday();
  const [backend, setBackend] = useState<OfficeBackend | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [tasks, setTasks] = useState<OfficeTask[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [day, setDay] = useState(initial.day);
  const [selected, setSelected] = useState(initial.agent);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [chatText, setChatText] = useState("");
  const [alsoTask, setAlsoTask] = useState(true);
  const [busy, setBusy] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionStorage.setItem("cindy-office-view", JSON.stringify({ day, agent: selected }));
  }, [day, selected]);

  useEffect(() => {
    let cancel = false;
    chooseBackend().then((chosen) => {
      if (cancel) return;
      setBackend(chosen.backend);
      setHealth(chosen.health);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!backend) return;
    let cancel = false;
    setLoading(true);
    Promise.all([backend.listTasks(), backend.listMessages()])
      .then(([nextTasks, nextMessages]) => {
        if (cancel) return;
        setTasks(nextTasks);
        setMessages(nextMessages);
        setError("");
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message || "讀取失敗");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [backend]);

  const refresh = async (source: OfficeBackend) => {
    const [nextTasks, nextMessages] = await Promise.all([source.listTasks(), source.listMessages()]);
    setTasks(nextTasks);
    setMessages(nextMessages);
  };

  const days = useMemo(() => collectDays(tasks, messages), [tasks, messages]);
  const visibleMessages = messages.filter((message) => message.agent_slug === selected && message.day === day);
  const dayTasks = tasks.filter((task) => task.day === day);
  const counts = {
    idle: dayTasks.filter((task) => task.status === "idle").length,
    doing: dayTasks.filter((task) => task.status === "doing").length,
    done: dayTasks.filter((task) => task.status === "done").length,
  };
  const selectedAgent = findAgent(selected);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [visibleMessages.length, chatOpen, selected, day]);

  const assign = async (agentSlug: string, event: FormEvent) => {
    event.preventDefault();
    const title = (drafts[agentSlug] || "").trim();
    if (!title || !backend) return;
    setBusy(agentSlug);
    setError("");
    setSelected(agentSlug);
    try {
      await backend.createTask({ agent_slug: agentSlug, title, day });
      setDrafts((prev) => ({ ...prev, [agentSlug]: "" }));
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "指派失敗");
    } finally {
      setBusy("");
    }
  };

  const changeStatus = async (taskId: string, status: TaskStatus) => {
    if (!backend) return;
    setError("");
    try {
      await backend.updateTask(taskId, status);
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法更新狀態");
    }
  };

  const removeTask = async (taskId: string) => {
    if (!backend) return;
    setError("");
    try {
      await backend.deleteTask(taskId);
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法刪除");
    }
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const content = chatText.trim();
    if (!content || !backend) return;
    setBusy("chat");
    setError("");
    try {
      await backend.sendChat({
        agent_slug: selected,
        content,
        day,
        create_task: alsoTask,
      });
      setChatText("");
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page">
      <header className="mast">
        <div className="sign">
          <p className="sign-kicker">五位同事的每日辦公室</p>
          <h1>Cindy's AI Agent Office</h1>
          <p>辛蒂的 AI 同事辦公室</p>
        </div>
        <p className="privacy" data-testid="privacy-note">
          這是公開頁面，沒有登入。請不要輸入密碼、金鑰或私人資料。
        </p>
        {health && (
          <p className="storage" data-testid="storage-mode">
            {storageSentence(health)}
          </p>
        )}
      </header>

      <div className="shell">
        <div className="timer-wrap">
          <Pomodoro />
        </div>
        <section className="office" aria-label="辦公室">
          <div className="datebar">
            <div className="date-nav">
              <button type="button" data-testid="day-prev" onClick={() => setDay(shiftDay(day, -1))} aria-label="前一天">
                ‹
              </button>
              <div className="date-copy">
                <p className="date-kicker">{day === today ? "今日進度" : "這一天的進度"}</p>
                <h2 data-testid="day-label">{formatDay(day)}</h2>
              </div>
              <button type="button" data-testid="day-next" onClick={() => setDay(shiftDay(day, 1))} aria-label="後一天">
                ›
              </button>
            </div>
            {day !== today && (
              <button type="button" data-testid="day-today" onClick={() => setDay(today)}>
                回到今天
              </button>
            )}
            <button type="button" data-testid="history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
              {historyOpen ? "收起紀錄" : "每日紀錄"}
            </button>
          </div>
          <p className="counts" data-testid="day-counts">
            待命 {counts.idle} · 進行中 {counts.doing} · 完成 {counts.done}
          </p>
          {day !== today && <p className="day-hint">新任務會記在這一天。</p>}
          {historyOpen && (
            <div className="history" data-testid="history">
              {days.length === 0 && <p>還沒有紀錄。指派一項任務後，日期會出現在這裡。</p>}
              {days.map((item) => (
                <button key={item.day} type="button" aria-current={item.day === day} onClick={() => setDay(item.day)}>
                  {formatDay(item.day)} · {item.total} 項 · 完成 {item.done}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {loading && <p data-testid="loading">正在讀取今日進度…</p>}

          <div className="rooms">
            {CINDY_AGENTS.map((agent, index) => {
              const mine = dayTasks.filter((task) => task.agent_slug === agent.slug);
              return (
                <article
                  key={agent.slug}
                  className={`room room-${agent.slug}${selected === agent.slug ? " is-selected" : ""}`}
                  style={{ ["--wall" as string]: agent.wall, ["--accent" as string]: agent.accent }}
                  data-testid={`room-${agent.slug}`}
                  onClick={() => setSelected(agent.slug)}
                >
                  <header className="room-head">
                    <span className="badge">{index + 1}</span>
                    <div className="room-id">
                      <h3>{agent.display_name}</h3>
                    </div>
                    <AgentFace slug={agent.slug} />
                  </header>
                  <p className="room-role">{agent.role}</p>
                  <p className="room-count">
                    {mine.length === 0
                      ? "這天還沒有任務"
                      : `這天 ${mine.length} 項 · 完成 ${mine.filter((task) => task.status === "done").length}`}
                  </p>
                  <div className="task-list">
                    {mine.length === 0 && <p className="empty">在下面輸入，按指派就會出現在這裡。</p>}
                    {mine.map((task) => (
                      <div key={task.task_id} className={`task is-${task.status}`} data-testid={`task-${task.task_id}`}>
                        <p className="task-title">{task.title}</p>
                        {task.result && <p className="task-result">{task.result}</p>}
                        <div className="task-actions">
                          <select
                            aria-label={`${task.title} 的狀態`}
                            data-testid={`task-status-${task.task_id}`}
                            value={task.status}
                            onChange={(event) => changeStatus(task.task_id, event.target.value as TaskStatus)}
                          >
                            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                          <button type="button" data-testid={`task-delete-${task.task_id}`} onClick={() => removeTask(task.task_id)}>
                            刪除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form className="task-form" onSubmit={(event) => assign(agent.slug, event)}>
                    <input
                      data-testid={`task-input-${agent.slug}`}
                      value={drafts[agent.slug] ?? ""}
                      placeholder={agent.placeholder}
                      aria-label={`指派給 ${agent.display_name}`}
                      maxLength={500}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [agent.slug]: event.target.value }))}
                    />
                    <button type="submit" data-testid={`task-submit-${agent.slug}`} disabled={!backend || busy === agent.slug}>
                      {busy === agent.slug ? "指派中" : "指派"}
                    </button>
                  </form>
                </article>
              );
            })}
            <div className="stairs" aria-hidden="true">
              <span>樓梯</span>
            </div>
          </div>
          <p className="pixel-link">
            <a href="./pixel.html">看看原本的像素辦公室（較適合大螢幕）</a>
          </p>
        </section>

        <aside className={`chat${chatOpen ? " is-open" : ""}`} data-testid="chat-panel" aria-label="對話">
          <div className="chat-head">
            <div>
              <p className="date-kicker">跟同事說話</p>
              <h2>和 {selectedAgent.display_name} 說話</h2>
            </div>
            <button type="button" className="chat-close" data-testid="chat-close" onClick={() => setChatOpen(false)}>
              關閉
            </button>
          </div>
          <div className="chips" role="tablist" aria-label="選擇同事">
            {CINDY_AGENTS.map((agent) => (
              <button
                key={agent.slug}
                type="button"
                className={agent.slug === selected ? "is-on" : ""}
                style={{ ["--accent" as string]: agent.accent }}
                onClick={() => setSelected(agent.slug)}
              >
                {agent.display_name}
              </button>
            ))}
          </div>
          <div className="thread" ref={threadRef}>
            {visibleMessages.length === 0 && <p className="empty">這一天還沒有跟這位同事說過話。直接輸入，就能指派或聊一句。</p>}
            {visibleMessages.map((message) => (
              <div key={message.message_id} className={`bubble ${message.role}`}>
                <span className="who">{message.role === "user" ? "你" : findAgent(message.agent_slug).display_name}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <label className="check">
              <input
                type="checkbox"
                data-testid="chat-create-task"
                checked={alsoTask}
                onChange={(event) => setAlsoTask(event.target.checked)}
              />
              這則對話也記成任務
            </label>
            <div className="chat-row">
              <input
                data-testid="chat-input"
                value={chatText}
                maxLength={4000}
                placeholder={`跟 ${selectedAgent.display_name} 說一聲`}
                aria-label={`傳訊息給 ${selectedAgent.display_name}`}
                onChange={(event) => setChatText(event.target.value)}
              />
              <button type="submit" data-testid="chat-send" disabled={!backend || busy === "chat"}>
                {busy === "chat" ? "送出中" : "送出"}
              </button>
            </div>
          </form>
        </aside>
      </div>

      {chatOpen && <button type="button" className="backdrop" aria-label="關閉對話" onClick={() => setChatOpen(false)} />}
      <button type="button" className="fab" data-testid="chat-fab" onClick={() => setChatOpen(true)}>
        跟同事說話
      </button>
    </div>
  );
}
