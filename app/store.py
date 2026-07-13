"""Persistente opslag op de data-volume: snapshot, first-seen registry, fotocache."""
import json
import os
import tempfile
from datetime import date

DATA_DIR = os.path.abspath(os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data")))
PHOTOS_DIR = os.path.join(DATA_DIR, "photos")
SNAPSHOT_PATH = os.path.join(DATA_DIR, "snapshot.json")
REGISTRY_PATH = os.path.join(DATA_DIR, "registry.json")

EMPTY_SNAPSHOT = {"scraped_at": None, "postcode": None, "dogs": [], "stats": {}}


def ensure_dirs():
    os.makedirs(PHOTOS_DIR, exist_ok=True)


def _write_atomic(path, payload):
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_snapshot():
    try:
        with open(SNAPSHOT_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return dict(EMPTY_SNAPSHOT)


def save_snapshot(snapshot):
    _write_atomic(SNAPSHOT_PATH, snapshot)


def load_registry():
    try:
        with open(REGISTRY_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"initialized": None, "dogs": {}}


def update_registry(seen_ids):
    """Registreer first/last-seen voor alle waargenomen dog-ids.

    De registry blijft dogs onthouden die verdwenen zijn, zodat een
    terugkerende hond niet opnieuw als Nieuw telt. De allereerste run zet
    'initialized', zodat de beginvoorraad niet integraal 'Nieuw' is.
    """
    registry = load_registry()
    today = date.today().isoformat()
    if registry["initialized"] is None:
        registry["initialized"] = today
    for dog_id in seen_ids:
        entry = registry["dogs"].setdefault(dog_id, {"first_seen": today})
        entry["last_seen"] = today
    _write_atomic(REGISTRY_PATH, registry)
    return registry
