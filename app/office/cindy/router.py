"""辛蒂辦公室 API。掛在 /api/v1/office/cindy。"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models import ApiEnvelope, make_id
from app.office.cindy.adapter import get_adapter, live_agent_enabled
from app.office.cindy.agents import get_agent, public_agents
from app.office.cindy.store import TASK_STATUSES, get_store

router = APIRouter()
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _taipei_zone():
    """台北全年 UTC+8。精簡映像檔不一定有時區資料，所以有退路。"""
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("Asia/Taipei")
    except Exception:
        return timezone(timedelta(hours=8))


_TAIPEI = _taipei_zone()


def _envelope(data: dict, error: Optional[str] = None) -> ApiEnvelope:
    return ApiEnvelope(trace_id=make_id("trc"), request_id=make_id("req"), data=data, error=error)


def taipei_today() -> str:
    return datetime.now(_TAIPEI).date().isoformat()


def _check_day(day: Optional[str]) -> str:
    value = (day or taipei_today()).strip()
    if not _DAY.match(value):
        raise HTTPException(status_code=400, detail="日期格式須為 YYYY-MM-DD")
    return value


def _check_agent(slug: str) -> Dict[str, Any]:
    agent = get_agent(slug)
    if agent is None:
        raise HTTPException(status_code=404, detail="找不到這位同事")
    return agent


class TaskCreate(BaseModel):
    agent_slug: str
    title: str = Field(min_length=1, max_length=500)
    day: Optional[str] = None
    via_maggie: bool = False


class TaskPatch(BaseModel):
    status: Optional[str] = None
    needs_you: Optional[bool] = None
    acked: Optional[bool] = None


class EventCreate(BaseModel):
    day: Optional[str] = None
    text: str = Field(min_length=1, max_length=300)
    kind: str = "info"


class ChatCreate(BaseModel):
    agent_slug: str
    content: str = Field(min_length=1, max_length=4000)
    day: Optional[str] = None
    create_task: bool = True


def _history_for(agent_slug: str) -> List[Dict[str, str]]:
    history: List[Dict[str, str]] = []
    for message in get_store().list_messages(agent_slug)[-6:]:
        role = "user" if message["role"] == "user" else "assistant"
        history.append({"role": role, "content": message["content"]})
    return history


@router.get("/health")
def health() -> ApiEnvelope:
    live = live_agent_enabled()
    if live:
        detail = "已設定模型。新任務會送給對應的 Agent。"
    else:
        detail = "尚未設定 DEFAULT_LLM_MODEL 與 API Key。任務只會記下來，不會送給 Agent。"
    return _envelope(
        {
            "status": "ok",
            "storage": "server",
            "live_agent": live,
            "detail": detail,
        }
    )


@router.get("/agents")
def agents() -> ApiEnvelope:
    return _envelope({"agents": public_agents()})


@router.get("/tasks")
def tasks(day: Optional[str] = None, agent_slug: Optional[str] = None) -> ApiEnvelope:
    if day is not None:
        day = _check_day(day)
    if agent_slug is not None:
        _check_agent(agent_slug)
    items = get_store().list_tasks(day=day, agent_slug=agent_slug)
    return _envelope({"tasks": items})


@router.get("/days")
def days() -> ApiEnvelope:
    return _envelope({"days": get_store().list_days()})


@router.get("/messages")
def messages(agent_slug: Optional[str] = None) -> ApiEnvelope:
    if agent_slug is not None:
        _check_agent(agent_slug)
    return _envelope({"messages": get_store().list_messages(agent_slug)})


@router.post("/tasks")
async def create_task(payload: TaskCreate) -> ApiEnvelope:
    agent = _check_agent(payload.agent_slug)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="請輸入任務內容")
    day = _check_day(payload.day)
    store = get_store()
    history = _history_for(agent["slug"])
    user_message = store.add_message(
        {
            "agent_slug": agent["slug"],
            "role": "user",
            "content": title,
            "day": day,
            "backend": "user",
        }
    )
    outcome = await get_adapter().handle(agent, title, history)
    task = store.add_task(
        {
            "agent_slug": agent["slug"],
            "title": title,
            "day": day,
            "status": "done" if outcome.completed else "idle",
            "result": outcome.reply if outcome.completed else "",
            "backend": outcome.backend,
            "via_maggie": payload.via_maggie,
        }
    )
    user_message["task_id"] = task["task_id"]
    reply = store.add_message(
        {
            "agent_slug": agent["slug"],
            "role": "agent",
            "content": outcome.reply,
            "day": day,
            "task_id": task["task_id"],
            "backend": outcome.backend,
        }
    )
    return _envelope({"task": task, "messages": [user_message, reply]})


@router.patch("/tasks/{task_id}")
def patch_task(task_id: str, payload: TaskPatch) -> ApiEnvelope:
    if payload.status is None and payload.needs_you is None and payload.acked is None:
        raise HTTPException(status_code=400, detail="沒有要更新的內容")
    if payload.status is not None and payload.status not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail="狀態須為 idle、doing 或 done")
    fields: Dict[str, Any] = {}
    if payload.status is not None:
        fields["status"] = payload.status
        if payload.status == "done" and payload.needs_you is None:
            fields["needs_you"] = True
            fields["acked"] = False
        elif payload.status in ("idle", "doing") and payload.needs_you is None:
            fields["needs_you"] = False
    if payload.needs_you is not None:
        fields["needs_you"] = payload.needs_you
    if payload.acked is not None:
        fields["acked"] = payload.acked
    task = get_store().update_task(task_id, **fields)
    if task is None:
        raise HTTPException(status_code=404, detail="找不到這項任務")
    return _envelope({"task": task})


@router.delete("/tasks/{task_id}")
def remove_task(task_id: str) -> ApiEnvelope:
    if not get_store().delete_task(task_id):
        raise HTTPException(status_code=404, detail="找不到這項任務")
    return _envelope({"deleted": True})


@router.post("/chat")
async def chat(payload: ChatCreate) -> ApiEnvelope:
    agent = _check_agent(payload.agent_slug)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="請輸入想說的話")
    day = _check_day(payload.day)
    store = get_store()
    history = _history_for(agent["slug"])
    user_message = store.add_message(
        {
            "agent_slug": agent["slug"],
            "role": "user",
            "content": content,
            "day": day,
            "backend": "user",
        }
    )
    outcome = await get_adapter().handle(agent, content, history)
    task = None
    if payload.create_task:
        title = content if len(content) <= 80 else content[:80] + "…"
        task = store.add_task(
            {
                "agent_slug": agent["slug"],
                "title": title,
                "day": day,
                "status": "done" if outcome.completed else "idle",
                "result": outcome.reply if outcome.completed else "",
                "backend": outcome.backend,
                "via_maggie": True,
            }
        )
        user_message["task_id"] = task["task_id"]
    reply = store.add_message(
        {
            "agent_slug": agent["slug"],
            "role": "agent",
            "content": outcome.reply,
            "day": day,
            "task_id": task["task_id"] if task else None,
            "backend": outcome.backend,
        }
    )
    return _envelope({"task": task, "messages": [user_message, reply]})


@router.get("/events")
def events(day: Optional[str] = None) -> ApiEnvelope:
    if day is not None:
        day = _check_day(day)
    return _envelope({"events": get_store().list_events(day)})


@router.post("/events")
def create_event(payload: EventCreate) -> ApiEnvelope:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="請輸入動態內容")
    event = get_store().add_event({"day": _check_day(payload.day), "text": text, "kind": payload.kind[:40]})
    return _envelope({"event": event})
