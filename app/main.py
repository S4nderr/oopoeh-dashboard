"""FastAPI-app: serveert het dashboard, de API en plant de nachtelijke scrape-run."""
import os
import threading
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import scraper
import store

store.ensure_dirs()

TIMEZONE = os.environ.get("TZ", "Europe/Amsterdam")
SCRAPE_TIME = os.environ.get("SCRAPE_TIME", "03:00")

_lock = threading.Lock()
_state = {
    "running": False,
    "phase": None,
    "done": 0,
    "total": None,
    "source": None,
    "started_at": None,
    "last_finished_at": None,
    "last_error": None,
    "last_stats": None,
}


def _progress(phase, done, total):
    with _lock:
        _state.update(phase=phase, done=done, total=total)


def _worker(max_pages):
    try:
        stats = scraper.run(_progress, max_pages=max_pages)
        with _lock:
            _state.update(last_stats=stats, last_error=None)
    except Exception as exc:  # snapshot blijft onaangetast bij een mislukte run
        with _lock:
            _state.update(last_error=str(exc))
    finally:
        with _lock:
            _state.update(running=False, phase=None, done=0, total=None,
                          last_finished_at=datetime.now().astimezone().isoformat())


def start_scrape(max_pages=None, source="handmatig"):
    with _lock:
        if _state["running"]:
            return False
        _state.update(running=True, phase="starten", done=0, total=None,
                      source=source, started_at=datetime.now().astimezone().isoformat())
    threading.Thread(target=_worker, args=(max_pages,), daemon=True).start()
    return True


def _initial_fill():
    if store.load_snapshot()["scraped_at"] is None:
        start_scrape(source="eerste vulling")


hour, minute = SCRAPE_TIME.split(":")
scheduler = BackgroundScheduler(timezone=TIMEZONE)
scheduler.add_job(lambda: start_scrape(source="nachtelijk schema"), "cron",
                  hour=int(hour), minute=int(minute), id="nightly")


@asynccontextmanager
async def lifespan(_app):
    scheduler.add_job(_initial_fill, "date",
                      run_date=datetime.now().astimezone() + timedelta(seconds=10))
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="OOPOEH Kandidaten", lifespan=lifespan)


class ScrapeOptions(BaseModel):
    max_pages: int | None = Field(default=None, ge=1, le=50)


@app.post("/api/scrape", status_code=202)
def api_scrape(options: ScrapeOptions | None = None):
    started = start_scrape(max_pages=options.max_pages if options else None)
    if not started:
        raise HTTPException(status_code=409, detail="Er draait al een scrape-run")
    return {"gestart": True}


@app.get("/api/status")
def api_status():
    with _lock:
        state = dict(_state)
    job = scheduler.get_job("nightly")
    state["next_run"] = job.next_run_time.isoformat() if job and job.next_run_time else None
    return state


@app.get("/api/dogs")
def api_dogs():
    snapshot = store.load_snapshot()
    beoordelingen = store.load_beoordelingen()
    for dog in snapshot["dogs"]:
        dog["beoordeling"] = beoordelingen.get(dog["id"])
    return snapshot


class Beoordeling(BaseModel):
    oordeel: Literal["ja", "nee"]


@app.put("/api/beoordeling/{dog_id}")
def api_beoordeel(dog_id: str, beoordeling: Beoordeling):
    beoordelingen = store.load_beoordelingen()
    beoordelingen[dog_id] = {"oordeel": beoordeling.oordeel, "op": date.today().isoformat()}
    store.save_beoordelingen(beoordelingen)
    return {"id": dog_id, **beoordelingen[dog_id]}


@app.delete("/api/beoordeling/{dog_id}")
def api_wis_beoordeling(dog_id: str):
    beoordelingen = store.load_beoordelingen()
    if dog_id in beoordelingen:
        del beoordelingen[dog_id]
        store.save_beoordelingen(beoordelingen)
    return {"id": dog_id, "beoordeling": None}


app.mount("/photos", StaticFiles(directory=store.PHOTOS_DIR), name="photos")
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True), name="static")
