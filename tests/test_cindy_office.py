"""辛蒂辦公室：五位同事、任務狀態、換日，以及重新讀檔後仍在。"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.office.cindy.adapter import LocalEchoAdapter, OfficeRuntimeAdapter
from app.office.cindy.agents import get_agent
from app.office.cindy.store import CindyStore

client = TestClient(app)


@pytest.fixture(autouse=True)
def cindy_file(tmp_path, monkeypatch):
    path = tmp_path / "cindy.json"
    monkeypatch.setenv("CINDY_OFFICE_DATA", str(path))
    monkeypatch.delenv("DEFAULT_LLM_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    return path


def test_lists_five_agents() -> None:
    response = client.get("/api/v1/office/cindy/agents")
    assert response.status_code == 200
    slugs = [agent["slug"] for agent in response.json()["data"]["agents"]]
    assert slugs == ["amy", "lily", "ken", "ivy", "maggie"]
    amy = response.json()["data"]["agents"][0]
    assert amy["role"] == "信件回覆、自媒體經紀人"


def test_health_says_tasks_are_not_sent_without_a_model() -> None:
    response = client.get("/api/v1/office/cindy/health")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["storage"] == "server"
    assert data["live_agent"] is False


def test_task_status_and_day_persist_across_new_store(cindy_file) -> None:
    created = client.post(
        "/api/v1/office/cindy/tasks",
        json={"agent_slug": "amy", "title": "回覆合作信", "day": "2026-11-03"},
    )
    assert created.status_code == 200
    task = created.json()["data"]["task"]
    assert task["status"] == "idle"
    assert task["backend"] == "local"

    reloaded = CindyStore(cindy_file)
    assert reloaded.list_tasks(day="2026-11-03")[0]["title"] == "回覆合作信"

    patched = client.patch(f"/api/v1/office/cindy/tasks/{task['task_id']}", json={"status": "doing"})
    assert patched.status_code == 200
    assert patched.json()["data"]["task"]["status"] == "doing"
    assert CindyStore(cindy_file).list_tasks(day="2026-11-03")[0]["status"] == "doing"

    done = client.patch(f"/api/v1/office/cindy/tasks/{task['task_id']}", json={"status": "done"})
    assert done.json()["data"]["task"]["status"] == "done"

    other_day = client.get("/api/v1/office/cindy/tasks", params={"day": "2026-11-02"})
    assert other_day.json()["data"]["tasks"] == []

    listed = client.get("/api/v1/office/cindy/tasks", params={"day": "2026-11-03"})
    assert listed.json()["data"]["tasks"][0]["status"] == "done"

    removed = client.delete(f"/api/v1/office/cindy/tasks/{task['task_id']}")
    assert removed.status_code == 200
    assert CindyStore(cindy_file).list_tasks(day="2026-11-03") == []


def test_chat_creates_a_task_and_a_traditional_chinese_ack() -> None:
    response = client.post(
        "/api/v1/office/cindy/chat",
        json={
            "agent_slug": "lily",
            "content": "整理這週的 AI 工具新聞",
            "day": "2026-11-03",
            "create_task": True,
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["task"]["agent_slug"] == "lily"
    assert data["task"]["status"] == "idle"
    assert any("先記在今天" in message["content"] for message in data["messages"])

    days = client.get("/api/v1/office/cindy/days").json()["data"]["days"]
    assert days[0]["day"] == "2026-11-03"
    assert days[0]["idle"] == 1


def test_unknown_agent_and_bad_status() -> None:
    missing = client.post(
        "/api/v1/office/cindy/tasks",
        json={"agent_slug": "nobody", "title": "你好", "day": "2026-11-03"},
    )
    assert missing.status_code == 404
    created = client.post(
        "/api/v1/office/cindy/tasks",
        json={"agent_slug": "ken", "title": "檢查登入風險", "day": "2026-11-03"},
    )
    task_id = created.json()["data"]["task"]["task_id"]
    bad = client.patch(f"/api/v1/office/cindy/tasks/{task_id}", json={"status": "hacked"})
    assert bad.status_code == 400


def test_adapter_stays_local_without_api_keys() -> None:
    agent = get_agent("maggie")
    assert agent is not None
    local = asyncio.run(LocalEchoAdapter().handle(agent, "排里程碑", []))
    assert local.completed is False
    assert local.backend == "local"
    assert "主管" in local.reply

    runtime = asyncio.run(OfficeRuntimeAdapter().handle(agent, "排里程碑", []))
    assert runtime.backend == "local"
    assert runtime.completed is False


def test_maggie_dispatch_report_and_activity_persist(cindy_file) -> None:
    created = client.post(
        "/api/v1/office/cindy/tasks",
        json={"agent_slug": "amy", "title": "回覆合作信", "day": "2026-11-03", "via_maggie": True},
    )
    assert created.status_code == 200
    task = created.json()["data"]["task"]
    assert task["via_maggie"] is True
    assert task["needs_you"] is False

    done = client.patch(f"/api/v1/office/cindy/tasks/{task['task_id']}", json={"status": "done"})
    assert done.json()["data"]["task"]["needs_you"] is True

    acked = client.patch(
        f"/api/v1/office/cindy/tasks/{task['task_id']}",
        json={"acked": True, "needs_you": False},
    )
    assert acked.json()["data"]["task"]["acked"] is True
    assert acked.json()["data"]["task"]["status"] == "done"

    noted = client.post(
        "/api/v1/office/cindy/events",
        json={"day": "2026-11-03", "text": "Maggie 把「回覆合作信」交給 Amy", "kind": "dispatch"},
    )
    assert noted.status_code == 200
    listed = client.get("/api/v1/office/cindy/events", params={"day": "2026-11-03"})
    assert listed.json()["data"]["events"][0]["text"].endswith("Amy")
    assert CindyStore(cindy_file).list_events(day="2026-11-03")[0]["kind"] == "dispatch"
