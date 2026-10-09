import csv
import time
from pathlib import Path

from backend.app.models.schemas import ScenarioRequest
from backend.app.services.optimizer_service import OptimizerService

OUTPUT = Path("experiments") / "qaoa_study_corrected.csv"
service = OptimizerService()

SCENARIOS = [
    {"name": "Normal conditions", "congestion_level": 0.20, "wind_condition": 0.15, "weather_penalty": 0.08, "restricted_airspace": False},
    {"name": "High congestion", "congestion_level": 0.75, "wind_condition": 0.0, "weather_penalty": 0.10, "restricted_airspace": False},
    {"name": "Strong headwind", "congestion_level": 0.25, "wind_condition": -0.70, "weather_penalty": 0.12, "restricted_airspace": False},
    {"name": "Restricted airspace", "congestion_level": 0.30, "wind_condition": 0.10, "weather_penalty": 0.08, "restricted_airspace": True},
    {"name": "Emissions priority", "congestion_level": 0.25, "wind_condition": 0.10, "weather_penalty": 0.08, "restricted_airspace": False, "emission_weight": 2.5, "fuel_weight": 1.6},
    {"name": "Fuel priority", "congestion_level": 0.25, "wind_condition": 0.10, "weather_penalty": 0.08, "restricted_airspace": False, "fuel_weight": 2.5, "emission_weight": 1.0},
]

fields = [
    "scenario", "seed", "method", "runtime_ms", "runtime_source",
    "objective", "distance_km", "fuel_kg", "co2_kg", "feasible",
    "route", "qiskit_used", "quantum_backend", "fallback",
]

rows = []

for scenario in SCENARIOS:
    for seed in (42, 43, 44):
        request = ScenarioRequest(
            **{**scenario, "scenario_name": scenario["name"], "seed": seed}
        )

        result = service.run(request)
        details = result.get("quantum_details") or {}
        simulation = details.get("simulation") or {}
        meta = details.get("meta") or {}

        methods = []

        classical_list = result.get("classical") or []
        dijkstra = next(
            (item for item in classical_list if item.get("algorithm") == "Dijkstra"),
            classical_list[0] if classical_list else {},
        )
        methods.append(("classical", dijkstra, "solver-reported"))

        quantum = result.get("quantum") or {}
        methods.append(("quantum", quantum, "qaoa-reported"))

        hybrid = result.get("hybrid") or {}
        methods.append(("hybrid", hybrid, "hybrid-pipeline-reported"))

        for method, value, runtime_source in methods:
            rows.append({
                "scenario": scenario["name"],
                "seed": seed,
                "method": method,
                "runtime_ms": value.get("runtime_ms"),
                "runtime_source": runtime_source,
                "objective": value.get("objective"),
                "distance_km": value.get("distance_km"),
                "fuel_kg": value.get("fuel_kg"),
                "co2_kg": value.get("co2_kg"),
                "feasible": value.get("feasible"),
                "route": " -> ".join(value.get("route") or []),
                "qiskit_used": meta.get("qiskit_used", False),
                "quantum_backend": simulation.get("backend", "not reported"),
                "fallback": meta.get("fallback", False),
            })

        print(f"Completed: {scenario['name']} | seed {seed}")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT.open("w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(file, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)

print(f"\nSaved {len(rows)} rows to: {OUTPUT.resolve()}")
print("Runtime source is recorded per method; values are local simulation measurements.")
