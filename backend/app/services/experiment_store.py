from __future__ import annotations
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
STORE_PATH = ROOT / "data" / "experiments.json"
_LOCK = threading.Lock()


def list_experiments(limit: int = 50):
    with _LOCK:
        if not STORE_PATH.exists():
            return []
        try:
            data = json.loads(STORE_PATH.read_text(encoding="utf-8"))
            return data[-max(1, min(limit, 200)):][::-1]
        except (OSError, json.JSONDecodeError):
            return []


def save_experiment(scenario: str, result: dict):
    entry = {
        "id": uuid4().hex[:12],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scenario": scenario,
        "classical_algorithm": (result.get("classical") or [{}])[0].get("algorithm", "unknown"),
        "hybrid_route": result.get("hybrid", {}).get("route", []),
        "distance_km": result.get("hybrid", {}).get("distance_km"),
        "fuel_kg": result.get("hybrid", {}).get("fuel_kg"),
        "co2_kg": result.get("hybrid", {}).get("co2_kg"),
        "objective": result.get("hybrid", {}).get("objective"),
        "quantum_backend": result.get("quantum_details", {}).get("simulation", {}).get("backend"),
        "qiskit_used": result.get("quantum_details", {}).get("meta", {}).get("qiskit_used", False),
    }
    with _LOCK:
        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            data = json.loads(STORE_PATH.read_text(encoding="utf-8")) if STORE_PATH.exists() else []
        except (OSError, json.JSONDecodeError):
            data = []
        data.append(entry)
        STORE_PATH.write_text(json.dumps(data[-500:], indent=2), encoding="utf-8")
    return entry
