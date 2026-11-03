"""把辛蒂辦公室的任務接到既有的 Agent 執行器。

AgentWorkAdapter 是唯一的接點：

- LocalEchoAdapter：不呼叫模型。任務記下來，回一段固定的繁體中文確認。
  靜態網站（GitHub Pages / Vercel）甚至不會打到這裡，而是用
  frontend/src/cindy/backend.ts 的 BrowserOfficeBackend，存在瀏覽器。
- OfficeRuntimeAdapter：若設定了模型與 API Key，就呼叫
  app.services.agents.runner.run_agent（這個倉庫原本的 Agent 迴圈）。
  沒有金鑰、資料庫連不上、或模型呼叫失敗時，退回 LocalEchoAdapter。

公開的靜態網站不應放入 API Key。要把任務真的送給模型，需要自架
這個 FastAPI，並自行加上登入；目前的 API 沒有帳號系統。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol

from app.office.cindy.agents import LOCAL_ACKS

logger = logging.getLogger(__name__)


@dataclass
class AdapterResult:
    backend: str
    reply: str
    completed: bool


class AgentWorkAdapter(Protocol):
    name: str

    async def handle(
        self,
        agent: Dict[str, Any],
        message: str,
        history: List[Dict[str, str]],
    ) -> AdapterResult:
        """接收一則指派。completed 為 True 時，呼叫端會把任務標成完成。"""


class LocalEchoAdapter:
    """沒有模型時的預設實作。只確認收到，不假裝事情已經做完。"""

    name = "local"

    async def handle(
        self,
        agent: Dict[str, Any],
        message: str,
        history: List[Dict[str, str]],
    ) -> AdapterResult:
        del message, history
        reply = LOCAL_ACKS.get(agent["slug"], "收到，已記入今日進度，狀態是待命。")
        return AdapterResult(backend="local", reply=reply, completed=False)


def resolve_live_config(slug: str) -> Optional[Dict[str, Optional[str]]]:
    """有模型名稱且找得到金鑰時，才把任務送給真正的 Agent。"""
    from app.config import settings

    try:
        from app.office.store import office_store

        if office_store is not None:
            configs = office_store.get_agent_model_configs()
            cfg = configs.get(slug) or {}
            model = (cfg.get("model_name") or "").strip()
            api_key = (cfg.get("api_key") or "").strip()
            api_base = (cfg.get("api_base") or "").strip()
            if model and (api_key or settings.has_any_llm_key):
                return {
                    "model": model,
                    "api_key": api_key or None,
                    "api_base": api_base or None,
                }
    except Exception:
        logger.warning("讀取 Agent 模型設定失敗，改看環境變數", exc_info=True)

    if settings.default_llm_model and settings.has_any_llm_key:
        return {"model": settings.default_llm_model, "api_key": None, "api_base": None}
    return None


def live_agent_enabled() -> bool:
    """全域模型已備妥，或任一同事在資料庫裡有自己的模型設定。"""
    from app.config import settings

    if settings.default_llm_model and settings.has_any_llm_key:
        return True
    from app.office.cindy.agents import CINDY_AGENTS

    return any(resolve_live_config(agent["slug"]) is not None for agent in CINDY_AGENTS)


class OfficeRuntimeAdapter:
    """優先呼叫倉庫既有的 run_agent，否則退回本地確認。"""

    name = "office-runtime"

    async def handle(
        self,
        agent: Dict[str, Any],
        message: str,
        history: List[Dict[str, str]],
    ) -> AdapterResult:
        cfg = resolve_live_config(agent["slug"])
        if cfg is None:
            return await LocalEchoAdapter().handle(agent, message, history)

        try:
            from app.services.agents.runner import run_agent

            result = await run_agent(
                agent_slug=agent["slug"],
                agent_defn={
                    "display_name": agent["display_name"],
                    "role": agent["role"],
                    "system_prompt": agent["system_prompt"],
                    "room_id": agent.get("room_id", "workspace"),
                    "phaser_agent_id": agent.get("phaser_agent_id", ""),
                    "color": agent.get("color", ""),
                },
                user_message=message,
                task_summary=message,
                conversation_history=history[-6:] or None,
                model=cfg["model"],
                api_base=cfg["api_base"],
                api_key=cfg["api_key"],
            )
        except Exception:
            logger.exception("辛蒂辦公室呼叫 Agent 失敗")
            fallback = await LocalEchoAdapter().handle(agent, message, history)
            fallback.reply += "（模型暫時沒有回覆，已先記在今日進度。）"
            return fallback

        content = ""
        for item in result.get("messages") or []:
            if item.get("role") == "agent" and (item.get("content") or "").strip():
                content = item["content"].strip()
        if not content:
            fallback = await LocalEchoAdapter().handle(agent, message, history)
            fallback.reply += "（模型沒有產生內容，已先記在今日進度。）"
            return fallback
        return AdapterResult(backend="office", reply=content, completed=True)


def get_adapter() -> AgentWorkAdapter:
    return OfficeRuntimeAdapter()
