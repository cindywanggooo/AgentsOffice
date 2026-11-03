import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CINDY_AGENTS, CINDY_GM, findAgent } from "./agents";
import { chooseBackend } from "./backend";
import type { OfficeBackend } from "./backend";
import { collectDays, formatDay, shiftDay, taipeiToday } from "./dates";
import { OfficeScene } from "./OfficeScene";
import { Pomodoro } from "./Pomodoro";
import { PRESENCE_LABEL, WORKERS, dispatchWorker, formatClock, meetingWith, presenceFor } from "./sim";
import type { Presence } from "./sim";
import { STATUS_LABEL } from "./types";
import type { ChatMessage, HealthInfo, OfficeEvent, OfficeTask, TaskStatus } from "./types";

type Tod = "now" | "day" | "dusk" | "night";
type Sheet = "team" | "inbox" | "tasks" | "feed";

const TEAM = [CINDY_GM, ...CINDY_AGENTS];

function loadTod(): Tod {
  const saved = localStorage.getItem("cindy-tod");
  if (saved === "now" || saved === "day" || saved === "dusk" || saved === "night") return saved;
  return "now";
}

export function CindyOffice() {
  const today = taipeiToday();
  const [backend, setBackend] = useState<OfficeBackend | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [tasks, setTasks] = useState<OfficeTask[]>([]);
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [day, setDay] = useState(today);
  const [selected, setSelected] = useState("maggie");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [tod, setTod] = useState<Tod>(loadTod);
  const [sheet, setSheet] = useState<Sheet>("team");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [walks, setWalks] = useState<Record<string, string>>({});
  const [bubbles, setBubbles] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem("cindy-tod", tod);
  }, [tod]);

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

  const refresh = async (source: OfficeBackend) => {
    const [nextTasks, nextEvents, nextMessages] = await Promise.all([
      source.listTasks(),
      source.listEvents(),
      source.listMessages(),
    ]);
    setTasks(nextTasks);
    setEvents(nextEvents);
    setMessages(nextMessages);
  };

  useEffect(() => {
    if (!backend) return;
    let cancel = false;
    refresh(backend)
      .catch((err: Error) => {
        if (!cancel) setError(err.message || "讀取失敗");
      });
    return () => {
      cancel = true;
    };
  }, [backend]);

  const dayTasks = tasks.filter((task) => task.day === day);
  const inbox = dayTasks.filter((task) => task.needs_you && !task.acked);
  const dayEvents = events.filter((event) => event.day === day).slice().reverse();
  const days = useMemo(() => collectDays(tasks, messages), [tasks, messages]);
  const counts = {
    working: WORKERS.filter((slug) => presenceFor(slug, tasks, day) === "working").length,
    needs: WORKERS.filter((slug) => presenceFor(slug, tasks, day) === "needs").length,
    idle: WORKERS.filter((slug) => presenceFor(slug, tasks, day) === "idle").length,
  };

  const play = (steps: Array<{ slug: string; spot: string; bubble: string }>, ms = 1700) => {
    const nextWalks: Record<string, string> = {};
    const nextBubbles: Record<string, string> = {};
    steps.forEach((step) => {
      nextWalks[step.slug] = step.spot;
      nextBubbles[step.slug] = step.bubble;
    });
    setWalks(nextWalks);
    setBubbles(nextBubbles);
    window.setTimeout(() => {
      setWalks({});
      setBubbles({});
    }, ms);
  };

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    const text = title.trim();
    if (!text || !backend) return;
    setBusy(true);
    setError("");
    const worker = dispatchWorker(text, target);
    const via = target === "auto";
    const name = findAgent(worker).display_name;
    const partner = meetingWith(text, worker);
    try {
      await backend.createTask({ agent_slug: worker, title: text, day, via_maggie: via });
      const desk = worker === "maggie" ? "maggieOffice" : worker;
      if (via && worker !== "maggie") {
        await backend.addEvent({ day, kind: "dispatch", text: `Maggie 把「${text}」交給 ${name}` });
      } else {
        await backend.addEvent({ day, kind: "direct", text: `總經理直接把「${text}」交給 ${name}` });
      }
      play([
        { slug: worker, spot: "whiteboard", bubble: "領任務" },
        ...(via && worker !== "maggie" ? [{ slug: "maggie", spot: "whiteboard", bubble: "交給你" }] : []),
      ]);
      window.setTimeout(() => {
        const steps = [{ slug: worker, spot: partner ? "meet" : desk, bubble: partner ? "一起看" : "開工" }];
        if (partner && partner !== "meet") steps.push({ slug: partner, spot: "meet", bubble: "過來一下" });
        play(steps, 2000);
      }, 1300);
      if (partner && partner !== "meet") {
        await backend.addEvent({
          day,
          kind: "collab",
          text: `${name} 走到 ${findAgent(partner).display_name} 旁邊討論「${text}」`,
        });
      } else if (partner === "meet") {
        await backend.addEvent({ day, kind: "collab", text: `${name} 到會議室討論「${text}」` });
      }
      setTitle("");
      setSelected(worker);
      setSheet("tasks");
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "指派失敗");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (task: OfficeTask, status: TaskStatus) => {
    if (!backend) return;
    setError("");
    try {
      await backend.updateTask(task.task_id, { status });
      if (status === "done") {
        const name = findAgent(task.agent_slug).display_name;
        await backend.addEvent({ day: task.day, kind: "report", text: `${name} 到主管室向 Maggie 回報「${task.title}」` });
        const home = task.agent_slug === "maggie" ? "maggieOffice" : task.agent_slug;
        play([{ slug: task.agent_slug, spot: home, bubble: "+1" }], 700);
        window.setTimeout(() => {
          play([{ slug: task.agent_slug, spot: "maggieOffice", bubble: "回報主管" }]);
        }, 700);
        window.setTimeout(() => {
          if (!backend) return;
          backend
            .addEvent({ day: task.day, kind: "gm", text: `Maggie 到總經理室回報「${task.title}」` })
            .then(() => refresh(backend))
            .catch(() => undefined);
          play(
            [
              { slug: "maggie", spot: "cindy", bubble: "報告總經理" },
              { slug: "cindy", spot: "cindy", bubble: "我看一下" },
            ],
            2200,
          );
        }, 1500);
      }
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法更新狀態");
    }
  };

  const ackReport = async (task: OfficeTask) => {
    if (!backend) return;
    setError("");
    try {
      await backend.updateTask(task.task_id, { acked: true, needs_you: false });
      await backend.addEvent({ day: task.day, kind: "ack", text: `總經理已讀「${task.title}」的回報` });
      play([{ slug: "maggie", spot: "maggieOffice", bubble: "好，我記下了" }]);
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法更新回報");
    }
  };

  const removeTask = async (taskId: string) => {
    if (!backend) return;
    try {
      await backend.deleteTask(taskId);
      await refresh(backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法刪除");
    }
  };

  const live = Boolean(health?.liveAgent);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <p className="kicker">Cindy's Staff Office</p>
          <h1>辛蒂的虛擬辦公室</h1>
          <span className={`sim-badge${live ? " is-live" : ""}`} data-testid="sim-badge">
            {live ? "已連接模型" : "模擬"}
          </span>
        </div>
        <div className="counters" data-testid="counters">
          <span>工作中 {counts.working}</span>
          <span>需要你 {counts.needs}</span>
          <span>閒置 {counts.idle}</span>
        </div>
        <div className="legend" aria-label="狀態圖例">
          {(Object.keys(PRESENCE_LABEL) as Presence[]).map((key) => (
            <span key={key} className={`legend-item ${key}`}>
              {PRESENCE_LABEL[key]}
            </span>
          ))}
        </div>
        <div className="tod" role="group" aria-label="時間">
          {(
            [
              ["now", "現在"],
              ["day", "白天"],
              ["dusk", "傍晚"],
              ["night", "夜晚"],
            ] as Array<[Tod, string]>
          ).map(([value, label]) => (
            <button key={value} type="button" className={tod === value ? "is-on" : ""} data-testid={`tod-${value}`} onClick={() => setTod(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="top-timer">
          <Pomodoro />
        </div>
      </header>
      <p className="honesty" data-testid="storage-mode">
        {live
          ? "已連接模型。新任務會送給同事的模型；人物走動仍是辦公室裡的示意。"
          : "模擬。人物會走動、Maggie 會分派，但任務沒有送到真正的模型。"}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="layout">
        <OfficeScene tasks={tasks} day={day} walks={walks} bubbles={bubbles} selected={selected} onSelect={setSelected} tod={tod} />

        <aside className="sidebar">
          <div className="sheet-tabs">
            {(
              [
                ["team", "團隊"],
                ["inbox", "回報"],
                ["tasks", "任務"],
                ["feed", "動態"],
              ] as Array<[Sheet, string]>
            ).map(([id, label]) => (
              <button key={id} type="button" className={sheet === id ? "is-on" : ""} onClick={() => setSheet(id)}>
                {label}
                {id === "inbox" && inbox.length > 0 ? ` ${inbox.length}` : ""}
              </button>
            ))}
          </div>

          <section className={`side-section${sheet === "team" ? " is-on" : ""}`}>
            <h2>團隊</h2>
            <ul className="roster">
              {TEAM.map((agent) => {
                const presence = presenceFor(agent.slug, tasks, day);
                return (
                  <li key={agent.slug}>
                    <button type="button" className={selected === agent.slug ? "is-on" : ""} onClick={() => setSelected(agent.slug)}>
                      <i style={{ background: agent.accent }} />
                      <span>
                        <strong>{agent.display_name}</strong>
                        <em>{agent.role}</em>
                      </span>
                      <b className={presence}>{PRESENCE_LABEL[presence]}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={`side-section${sheet === "inbox" ? " is-on" : ""}`} data-testid="inbox">
            <h2>給總經理的回報</h2>
            {inbox.length === 0 && <p className="empty">目前沒有待讀回報。同事完成後，Maggie 會送到這裡。</p>}
            {inbox.map((task) => (
              <article key={task.task_id} className="report">
                <p>
                  Maggie 彙整：{findAgent(task.agent_slug).display_name} 完成了「{task.title}」
                </p>
                <button type="button" onClick={() => ackReport(task)}>
                  知道了
                </button>
              </article>
            ))}
          </section>

          <section className={`side-section${sheet === "tasks" ? " is-on" : ""}`}>
            <h2>指派任務</h2>
            <form className="assign" onSubmit={assign}>
              <input
                data-testid="task-input"
                value={title}
                maxLength={500}
                placeholder="交代一件事，預設由 Maggie 分派"
                aria-label="任務內容"
                onChange={(event) => setTitle(event.target.value)}
              />
              <select data-testid="task-target" value={target} aria-label="交給誰" onChange={(event) => setTarget(event.target.value)}>
                <option value="auto">交給 Maggie 分派</option>
                {CINDY_AGENTS.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    直接交給 {agent.display_name}
                  </option>
                ))}
              </select>
              <button type="submit" data-testid="task-submit" disabled={!backend || busy}>
                {busy ? "指派中" : "指派"}
              </button>
            </form>
            <div className="datebar">
              <button type="button" data-testid="day-prev" onClick={() => setDay(shiftDay(day, -1))} aria-label="前一天">
                ‹
              </button>
              <div>
                <p className="kicker">{day === today ? "今日進度" : "這一天的進度"}</p>
                <h2 data-testid="day-label">{formatDay(day)}</h2>
              </div>
              <button type="button" data-testid="day-next" onClick={() => setDay(shiftDay(day, 1))} aria-label="後一天">
                ›
              </button>
              {day !== today && (
                <button type="button" data-testid="day-today" onClick={() => setDay(today)}>
                  回到今天
                </button>
              )}
              <button type="button" data-testid="history-toggle" onClick={() => setHistoryOpen((open) => !open)}>
                {historyOpen ? "收起紀錄" : "每日紀錄"}
              </button>
            </div>
            <p className="counts-line">
              待命 {dayTasks.filter((task) => task.status === "idle").length} · 進行中 {dayTasks.filter((task) => task.status === "doing").length} · 完成{" "}
              {dayTasks.filter((task) => task.status === "done").length}
            </p>
            {historyOpen && (
              <div className="history" data-testid="history">
                {days.length === 0 && <p className="empty">還沒有其他日期。</p>}
                {days.map((item) => (
                  <button key={item.day} type="button" onClick={() => setDay(item.day)}>
                    {formatDay(item.day)} · {item.total} 項 · 完成 {item.done}
                  </button>
                ))}
              </div>
            )}
            <div className="task-list">
              {dayTasks.length === 0 && <p className="empty">這天還沒有任務。</p>}
              {dayTasks.map((task) => (
                <div key={task.task_id} className={`task is-${task.status}`} data-testid={`task-${task.task_id}`}>
                  <p className="task-title">
                    {findAgent(task.agent_slug).display_name} · {task.title}
                    {task.via_maggie ? " · Maggie 分派" : ""}
                  </p>
                  <div className="task-actions">
                    <select
                      aria-label={`${task.title} 的狀態`}
                      data-testid={`task-status-${task.task_id}`}
                      value={task.status}
                      onChange={(event) => changeStatus(task, event.target.value as TaskStatus)}
                    >
                      {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeTask(task.task_id)}>
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`side-section${sheet === "feed" ? " is-on" : ""}`} data-testid="activity">
            <h2>動態</h2>
            {dayEvents.length === 0 && <p className="empty">這天還沒有動靜。指派一件事就會出現。</p>}
            <ol className="feed">
              {dayEvents.map((item) => (
                <li key={item.event_id}>
                  <time>{formatClock(item.created_at)}</time>
                  {item.text}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
