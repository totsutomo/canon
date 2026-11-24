import os
import sqlite3
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import libsql
except ImportError:
    libsql = None

DB_PATH = Path("/tmp/canon.db") if os.environ.get("VERCEL") else (Path(__file__).parent / "data.db")
TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

SCHEMA = """
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    fmt TEXT NOT NULL,
    question_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    idk INTEGER NOT NULL DEFAULT 0,
    lv INTEGER NOT NULL DEFAULT 1,
    is_kindai INTEGER NOT NULL DEFAULT 0,
    local_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_date ON attempts(local_date);
CREATE INDEX IF NOT EXISTS idx_attempts_qid ON attempts(question_id);

CREATE TABLE IF NOT EXISTS cleared_items (
    question_id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    fmt TEXT NOT NULL,
    is_kindai INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weak_scores (
    weak_key TEXT PRIMARY KEY,
    subject TEXT NOT NULL DEFAULT 'kobun',
    score INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

_lock = threading.RLock()
_conn = None


def _open_connection():
    if TURSO_DATABASE_URL and TURSO_AUTH_TOKEN and libsql is not None:
        conn = libsql.connect(
            database=TURSO_DATABASE_URL,
            auth_token=TURSO_AUTH_TOKEN,
        )
    elif libsql is not None:
        conn = libsql.connect(str(DB_PATH))
    else:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    for stmt in SCHEMA.strip().split(";"):
        s = stmt.strip()
        if s:
            conn.execute(s)
    conn.commit()
    return conn


def get_conn():
    global _conn
    with _lock:
        if _conn is None:
            _conn = _open_connection()
        return _conn


def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description] if cur.description else []
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_full_state():
    with _lock:
        conn = get_conn()
        c_cur = conn.execute("SELECT question_id FROM cleared_items")
        cleared = {row[0]: 1 for row in c_cur.fetchall()}
        w_cur = conn.execute("SELECT weak_key, score FROM weak_scores WHERE score > 0")
        weak = {row[0]: int(row[1]) for row in w_cur.fetchall()}
        s_cur = conn.execute("SELECT key, value FROM settings")
        settings = {row[0]: row[1] for row in s_cur.fetchall()}
        return {"cleared": cleared, "weak": weak, "settings": settings}


def record_attempt(
    subject: str,
    fmt: str,
    question_id: str,
    correct: bool,
    idk: bool,
    lv: int,
    is_kindai: bool,
    weak_keys: list[str],
    local_date: str,
):
    with _lock:
        conn = get_conn()
        conn.execute(
            """
            INSERT INTO attempts (subject, fmt, question_id, correct, idk, lv, is_kindai, local_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                subject,
                fmt,
                question_id,
                1 if correct else 0,
                1 if idk else 0,
                int(lv or 1),
                1 if is_kindai else 0,
                local_date,
            ),
        )
        if correct:
            conn.execute(
                """
                INSERT INTO cleared_items (question_id, subject, fmt, is_kindai, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(question_id) DO UPDATE SET updated_at = datetime('now')
                """,
                (question_id, subject, fmt, 1 if is_kindai else 0),
            )
        else:
            conn.execute("DELETE FROM cleared_items WHERE question_id = ?", (question_id,))

        for k in weak_keys:
            if not k:
                continue
            cur = conn.execute("SELECT score FROM weak_scores WHERE weak_key = ?", (k,))
            row = cur.fetchone()
            old = int(row[0]) if row else 0
            new_score = max(0, old - 1) if correct else min(8, old + 2)
            if new_score > 0:
                conn.execute(
                    """
                    INSERT INTO weak_scores (weak_key, subject, score, updated_at)
                    VALUES (?, ?, ?, datetime('now'))
                    ON CONFLICT(weak_key) DO UPDATE SET score = excluded.score, updated_at = datetime('now')
                    """,
                    (k, subject, new_score),
                )
            else:
                conn.execute("DELETE FROM weak_scores WHERE weak_key = ?", (k,))
        conn.commit()


def reset_weak():
    with _lock:
        conn = get_conn()
        conn.execute("DELETE FROM weak_scores")
        conn.commit()


def reset_cleared():
    with _lock:
        conn = get_conn()
        conn.execute("DELETE FROM cleared_items")
        conn.commit()


def get_stats(days: int = 14, totals: dict | None = None):
    days = max(7, min(90, int(days or 14)))
    today = date.today()
    start_date = (today - timedelta(days=days - 1)).isoformat()
    d7_start = (today - timedelta(days=6)).isoformat()
    prev7_start = (today - timedelta(days=13)).isoformat()
    prev7_end = (today - timedelta(days=7)).isoformat()

    with _lock:
        conn = get_conn()
        # Cleared by bucket
        c_cur = conn.execute("SELECT question_id, subject, fmt, is_kindai FROM cleared_items")
        cleared_rows = _fetchall_dict(c_cur)

        # Attempts in range
        a_cur = conn.execute(
            """
            SELECT local_date,
                   COUNT(*) AS total,
                   SUM(correct) AS correct,
                   SUM(idk) AS idk
            FROM attempts
            WHERE local_date >= ?
            GROUP BY local_date
            ORDER BY local_date ASC
            """,
            (start_date,),
        )
        daily_map = {r["local_date"]: r for r in _fetchall_dict(a_cur)}

        # Recent 7d vs prev 7d
        r7 = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(correct),0), COALESCE(SUM(idk),0) FROM attempts WHERE local_date >= ?",
            (d7_start,),
        ).fetchone()
        p7 = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(correct),0), COALESCE(SUM(idk),0) FROM attempts WHERE local_date >= ? AND local_date <= ?",
            (prev7_start, prev7_end),
        ).fetchone()

        # Total attempts all time
        all_cnt = conn.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]

        # Weak top
        w_cur = conn.execute(
            "SELECT weak_key, subject, score FROM weak_scores WHERE score > 0 ORDER BY score DESC, weak_key ASC LIMIT 12"
        )
        weak_top = _fetchall_dict(w_cur)

    # Build daily series
    daily = []
    for i in range(days):
        d = (today - timedelta(days=days - 1 - i)).isoformat()
        row = daily_map.get(d)
        tot = int(row["total"]) if row else 0
        cor = int(row["correct"]) if row else 0
        idk = int(row["idk"]) if row else 0
        daily.append(
            {
                "date": d,
                "total": tot,
                "correct": cor,
                "idk": idk,
                "accuracy": round(cor * 100 / tot, 1) if tot else None,
            }
        )

    # Cleared breakdown
    buckets = {
        "kobun_total": 0,
        "kanbun_total": 0,
        "kobun_wayaku": 0,
        "kobun_wajiko_koten": 0,
        "kobun_wajiko_kindai": 0,
        "kobun_keigo": 0,
        "kobun_shiki": 0,
        "kanbun_quiz": 0,
    }
    for r in cleared_rows:
        if r["subject"] == "kobun":
            buckets["kobun_total"] += 1
            if r["fmt"] == "wayaku":
                buckets["kobun_wayaku"] += 1
            elif r["fmt"] == "wajiko":
                if r["is_kindai"]:
                    buckets["kobun_wajiko_kindai"] += 1
                else:
                    buckets["kobun_wajiko_koten"] += 1
            elif r["fmt"] == "keigo":
                buckets["kobun_keigo"] += 1
            elif r["fmt"] == "shiki":
                buckets["kobun_shiki"] += 1
        elif r["subject"] == "kanbun":
            buckets["kanbun_total"] += 1
            buckets["kanbun_quiz"] += 1

    r7_tot, r7_cor, r7_idk = int(r7[0] or 0), int(r7[1] or 0), int(r7[2] or 0)
    p7_tot, p7_cor, _ = int(p7[0] or 0), int(p7[1] or 0), int(p7[2] or 0)
    acc7 = round(r7_cor * 100 / r7_tot, 1) if r7_tot else None
    acc_prev7 = round(p7_cor * 100 / p7_tot, 1) if p7_tot else None
    idk7 = round(r7_idk * 100 / r7_tot, 1) if r7_tot else None

    return {
        "cleared_total": len(cleared_rows),
        "attempts_total": int(all_cnt or 0),
        "buckets": buckets,
        "recent7": {
            "total": r7_tot,
            "correct": r7_cor,
            "idk": r7_idk,
            "accuracy": acc7,
            "prev_accuracy": acc_prev7,
            "accuracy_diff": round(acc7 - acc_prev7, 1) if (acc7 is not None and acc_prev7 is not None) else None,
            "idk_rate": idk7,
        },
        "daily": daily,
        "weak_top": weak_top,
    }
