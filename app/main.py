from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.models import ApiEnvelope, make_id
from app.office.cindy.router import router as cindy_router
from app.office.router import router as office_router

app = FastAPI(title="AgentsOffice", version="0.1.0")
app.include_router(office_router, prefix="/api/v1/office", tags=["AgentsOffice"])
app.include_router(cindy_router, prefix="/api/v1/office/cindy", tags=["CindyOffice"])

# 預設不開 CORS。只有自架、且前端網域不同時才設定，不要用 * 把 API 暴露給所有網站。
_cindy_origins = [item.strip() for item in os.getenv("CINDY_CORS_ORIGINS", "").split(",") if item.strip()]
if _cindy_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cindy_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True), name="static")


def envelope(trace_id: str, data: dict, error: Optional[str] = None) -> ApiEnvelope:
    return ApiEnvelope(trace_id=trace_id, request_id=make_id("req"), data=data, error=error)


@app.get("/")
def home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/v1/health")
def health() -> ApiEnvelope:
    trace_id = make_id("trc")
    return envelope(trace_id=trace_id, data={"status": "ok"})
