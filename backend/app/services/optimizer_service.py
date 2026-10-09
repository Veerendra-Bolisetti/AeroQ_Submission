from __future__ import annotations
from backend.app.services.graph_service import AirspaceGraph
from backend.app.services.cost_service import CostModel
from backend.app.ml.surrogate import SyntheticFuelModel
from backend.app.optimization.classical import solve_classical
from backend.app.optimization.hybrid import solve_hybrid
from backend.app.services.explanation import explain
from backend.app.quantum.qubo import QUBOModel


class OptimizerService:
    def run(self, scenario):
        graph = AirspaceGraph(scenario.seed).build(scenario)
        ml = SyntheticFuelModel(scenario.seed) if scenario.use_ml_cost else None
        cost = CostModel(graph, scenario, ml)
        classical = solve_classical(graph, scenario, cost)
        chosen, q, qmeta = solve_hybrid(graph, scenario, cost)
        hmetrics = {k: v for k, v in chosen.items() if k != "route"}

        def route_result(name, path, metrics, runtime_ms=None):
            out = {"algorithm": name, "route": path, **metrics}
            if runtime_ms is not None:
                out["runtime_ms"] = runtime_ms
            return out

        classical_json = [route_result(name, path, metrics) for name, path, metrics in classical]
        hybrid_json = route_result("Hybrid", chosen["route"], hmetrics, qmeta["total_runtime_ms"])
        q_candidate = qmeta.get("quantum_candidate")
        if q_candidate:
            qmetrics = {k: v for k, v in q_candidate.items() if k not in ("route", "algorithm")}
            quantum_json = route_result("Qiskit QAOA" if qmeta["qiskit_used"] else "QAOA state-vector fallback", q_candidate["route"], qmetrics, q.get("runtime_ms", 0.0))
            quantum_json["explanation"] = "Route decoded from a measured one-hot candidate in the local QAOA simulation."
        else:
            quantum_json = {
                "algorithm": "Qiskit QAOA" if qmeta["qiskit_used"] else "QAOA state-vector fallback",
                "route": [], "distance_km": None, "fuel_kg": None, "co2_kg": None,
                "time_min": None, "congestion": None, "objective": None,
                "runtime_ms": q.get("runtime_ms", 0.0), "feasible": False,
                "explanation": "No feasible one-hot route candidate was observed in the measured bitstrings. The hybrid stage used a separately labelled classical feasibility repair.",
            }

        baseline = classical[0][2]
        def pct(a, b):
            return ((a - b) / a * 100.0) if a else 0.0
        comparison = {
            "fuel_reduction_pct": pct(baseline["fuel_kg"], hmetrics["fuel_kg"]),
            "emission_reduction_pct": pct(baseline["co2_kg"], hmetrics["co2_kg"]),
            "distance_difference_pct": pct(baseline["distance_km"], hmetrics["distance_km"]),
            "objective_improvement_pct": pct(baseline["objective"], hmetrics["objective"]),
        }
        qubo = QUBOModel(qmeta["candidates"], penalty=20.0)
        ml_details = ml.info() if ml else {"enabled": False, "model": "disabled"}
        if ml:
            ml_details["enabled"] = True
        else:
            ml_details["enabled"] = False
        output = {
            "scenario": scenario.scenario_name,
            "graph": AirspaceGraph.serialise(graph),
            "classical": classical_json,
            "hybrid": hybrid_json,
            "quantum": quantum_json,
            "comparison": comparison,
            "explanation": explain(classical, {"route": chosen["route"], "metrics": hmetrics}),
            "quantum_details": {
                "qubo": qubo.as_dict(), "simulation": q,
                "meta": {k: v for k, v in qmeta.items() if k != "candidates"},
            },
            "candidate_routes": qmeta["candidates"],
            "ml_details": ml_details,
        }
        return output
