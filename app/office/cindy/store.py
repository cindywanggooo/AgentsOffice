"""辛蒂辦公室的任務與對話儲存。

預設寫入倉庫的 data/cindy_office.json，不需要 PostgreSQL。
靜態網站（GitHub Pages、Vercel）不會用到這個檔案，瀏覽器改存 localStorage。
測試可設環境變數 CINDY_OFFICE_DATA 指向別的路徑。
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.models import make_id, now_iso

logger = logging.getLogger(__name__)

DEFAULT_PATH = Path(__file__).resolve().parents[3] / "data" / "cindy_office.json"
TASK_STATUSES = ("idle", "doing", "done")

_guard = threading.Lock()
_current: Optional["CindyStore"] = None


def store_path() -> Path:
    raw = os.environ.get("CINDY_OFFICE_DATA", "").strip()
    if raw:
        return Path(raw)
    return DEFAULT_PATH


class CindyStore:
    def __init__(self, path: Path) -> None:
        self.path = path.resolve()
        self._lock = threading.Lock()

    def list_tasks(self, day: Optional[str] = None, agent_slug: Optional[str] = None) -> List[Dict[str, Any]]:
        data = self._read()
        tasks = data["tasks"]
        if day:
            tasks = [task for task in tasks if task["day"] == day]
        if agent_slug:
            tasks = [task for task in tasks if task["agent_slug"] == agent_slug]
        return sorted(tasks, key=lambda task: task["created_at"])

    def list_messages(self, agent_slug: Optional[str] = None) -> List[Dict[str, Any]]:
        data = self._read()
        messages = data["messages"]
        if agent_slug:
            messages = [msg for msg in messages if msg["agent_slug"] == agent_slug]
        return sorted(messages, key=lambda msg: msg["created_at"])[-400:]

    def list_days(self) -> List[Dict[str, Any]]:
        data = self._read()
        days: Dict[str, Dict[str, Any]] = {}
        for task in data["tasks"]:
            bucket = days.setdefault(
                task["day"],
                {"day": task["day"], "total": 0, "idle": 0, "doing": 0, "done": 0},
            )
            bucket["total"] += 1
            status = task["status"] if task["status"] in TASK_STATUSES else "idle"
            bucket[status] += 1
        for message in data["messages"]:
            days.setdefault(
                message["day"],
                {"day": message["day"], "total": 0, "idle": 0, "doing": 0, "done": 0},
            )
        return sorted(days.values(), key=lambda item: item["day"], reverse=True)

    def add_task(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        task = {
            "task_id": make_id("task"),
            "agent_slug": fields["agent_slug"],
            "title": fields["title"],
            "day": fields["day"],
            "status": fields.get("status", "idle"),
            "result": fields.get("result") or "",
            "backend": fields.get("backend") or "local",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }

        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            data["tasks"].append(task)
            if len(data["tasks"]) > 1000:
                data["tasks"] = data["tasks"][-1000:]
            return task

        return self._mutate(mutate)

    def update_task(self, task_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
        def mutate(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            for task in data["tasks"]:
                if task["task_id"] != task_id:
                    continue
                if "status" in fields and fields["status"] is not None:
                    task["status"] = fields["status"]
                if "result" in fields and fields["result"] is not None:
                    task["result"] = fields["result"]
                if "backend" in fields and fields["backend"] is not None:
                    task["backend"] = fields["backend"]
                task["updated_at"] = now_iso()
                return task
            return None

        return self._mutate(mutate)

    def delete_task(self, task_id: str) -> bool:
        def mutate(data: Dict[str, Any]) -> bool:
            before = len(data["tasks"])
            data["tasks"] = [task for task in data["tasks"] if task["task_id"] != task_id]
            return len(data["tasks"]) != before

        return self._mutate(mutate)

    def add_message(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        message = {
            "message_id": make_id("msg"),
            "agent_slug": fields["agent_slug"],
            "role": fields["role"],
            "content": fields["content"],
            "day": fields["day"],
            "task_id": fields.get("task_id"),
            "backend": fields.get("backend") or "local",
            "created_at": now_iso(),
        }

        def mutate(data: Dict[str, Any]) -> Dict[str, Any]:
            data["messages"].append(message)
            if len(data["messages"]) > 400:
                data["messages"] = data["messages"][-400:]
            return message

        return self._mutate(mutate)

    def _mutate(self, fn: Callable[[Dict[str, Any]], Any]) -> Any:
        with self._lock:
            data = self._load()
            result = fn(data)
            self._save(data)
            return result

    def _read(self) -> Dict[str, Any]:
        with self._lock:
            return self._load()

    def _load(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {"tasks": [], "messages": []}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("無法讀取 %s，改用空白進度", self.path)
            return {"tasks": [], "messages": []}
        if not isinstance(raw, dict):
            return {"tasks": [], "messages": []}
        raw.setdefault("tasks", [])
        raw.setdefault("messages", [])
        return raw

    def _save(self, data: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)


def get_store() -> CindyStore:
    global _current
    path = store_path().resolve()
    with _guard:
        if _current is None or _current.path != path:
            _current = CindyStore(path)
        return _current
