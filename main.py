from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Canon")
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class AttemptIn(BaseModel):
    subject: str
    fmt: str
    question_id: str
    correct: bool
    idk: bool = False
    lv: int = 1
    is_kindai: bool = False
    weak_keys: List[str] = []
    local_date: str


@app.on_event("startup")
def _startup():
    database.get_conn()


@app.get("/api/build-info")
def api_build_info():
    p = BASE_DIR / "build_info.txt"
    built_at = p.read_text(encoding="utf-8").strip() if p.exists() else ""
    return {"built_at": built_at}


@app.get("/api/state")
def api_state():
    return database.get_full_state()


@app.post("/api/attempt")
def api_attempt(body: AttemptIn):
    database.record_attempt(
        subject=body.subject,
        fmt=body.fmt,
        question_id=body.question_id,
        correct=body.correct,
        idk=body.idk,
        lv=body.lv,
        is_kindai=body.is_kindai,
        weak_keys=body.weak_keys,
        local_date=body.local_date,
    )
    return {"ok": True}


@app.post("/api/reset-weak")
def api_reset_weak():
    database.reset_weak()
    return {"ok": True}


@app.post("/api/reset-cleared")
def api_reset_cleared():
    database.reset_cleared()
    return {"ok": True}


@app.get("/api/stats")
def api_stats(days: int = 14):
    return database.get_stats(days=days)


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manifest.json")
def manifest():
    return FileResponse(STATIC_DIR / "manifest.json", media_type="application/manifest+json")


@app.get("/service-worker.js")
def sw():
    return FileResponse(STATIC_DIR / "service-worker.js", media_type="application/javascript")


@app.get("/favicon.ico")
def favicon():
    ico = STATIC_DIR / "favicon.ico"
    if ico.exists():
        return FileResponse(ico, media_type="image/x-icon")
    return JSONResponse({"error": "not found"}, status_code=404)


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
