import { useEffect, useState } from "react";

const WORK_MS = 25 * 60 * 1000;
const STORAGE_KEY = "cindy-pomodoro-v1";

interface TimerState {
  remainingMs: number;
  running: boolean;
  endsAt: number | null;
  finished: boolean;
}

function freshTimer(): TimerState {
  return { remainingMs: WORK_MS, running: false, endsAt: null, finished: false };
}

function loadTimer(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshTimer();
    const parsed = JSON.parse(raw) as TimerState;
    if (parsed.running && parsed.endsAt) {
      const remainingMs = Math.max(0, parsed.endsAt - Date.now());
      if (remainingMs <= 0) return { remainingMs: 0, running: false, endsAt: null, finished: true };
      return { remainingMs, running: true, endsAt: parsed.endsAt, finished: false };
    }
    const remainingMs = typeof parsed.remainingMs === "number" ? parsed.remainingMs : WORK_MS;
    return { remainingMs, running: false, endsAt: null, finished: Boolean(parsed.finished) && remainingMs <= 0 };
  } catch {
    return freshTimer();
  }
}

function formatMs(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function Pomodoro() {
  const [state, setState] = useState<TimerState>(loadTimer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 計時器存不進去不影響任務。
    }
  }, [state]);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [state.running]);

  const remaining = state.running && state.endsAt ? Math.max(0, state.endsAt - now) : state.remainingMs;

  useEffect(() => {
    if (state.running && state.endsAt && remaining <= 0) {
      setState({ remainingMs: 0, running: false, endsAt: null, finished: true });
    }
  }, [remaining, state.running, state.endsAt]);

  const ratio = Math.min(1, Math.max(0, remaining / WORK_MS));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const label = state.running ? "暫停" : remaining > 0 && remaining < WORK_MS ? "繼續" : "開始";

  const startFrom = (ms: number) => {
    setState({ remainingMs: ms, running: true, endsAt: Date.now() + ms, finished: false });
  };

  return (
    <section className={`timer${state.finished ? " is-done" : ""}`} aria-label="番茄鐘">
      <div className="timer-top">
        <svg className="timer-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#5a4636" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#ffe08a"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <div>
          <p className="timer-label">倒數計時</p>
          <p className="timer-readout" data-testid="pomo-time">
            {formatMs(remaining)}
          </p>
        </div>
      </div>
      <p className="timer-note" role="status">
        {state.finished ? "時間到，休息一下吧" : "工作 25 分鐘"}
      </p>
      <div className="timer-actions">
        <button
          type="button"
          data-testid="pomo-toggle"
          onClick={() => {
            if (state.running) {
              const left = state.endsAt ? Math.max(0, state.endsAt - Date.now()) : remaining;
              setState({ remainingMs: left, running: false, endsAt: null, finished: false });
              return;
            }
            startFrom(remaining > 0 ? remaining : WORK_MS);
          }}
        >
          {label}
        </button>
        <button type="button" data-testid="pomo-reset" onClick={() => setState(freshTimer())}>
          重設
        </button>
      </div>
    </section>
  );
}
