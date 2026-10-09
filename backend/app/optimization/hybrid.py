from __future__ import annotations
import time
import networkx as nx
from backend.app.quantum.qubo import QUBOModel
from backend.app.quantum.simulator import QAOASimulator
from backend.app.quantum.qiskit_runner import run_qiskit_qaoa


def candidate_paths(g, source, target, cost_model, limit=8):
    rows = []
    for path in nx.all_simple_paths(g, source, target, cutoff=6):
        metrics = cost_model.path_metrics(path)
        if metrics["feasible"]:
            rows.append({"route": path, **metrics})
    rows.sort(key=lambda row: row["objective"])
    if not rows:
        # Keep an explicit infeasible preview only to help the UI explain why no
        # valid route is available. The API does not claim it is operationally usable.
        try:
            path = nx.shortest_path(g, source, target, weight=lambda u,v,d: cost_model.edge_cost(u,v,d))
            return [{"route": path, **cost_model.path_metrics(path)}]
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []
    return rows[:limit]


def solve_hybrid(g, scenario, cost_model):
    started = time.perf_counter()
    candidates = candidate_paths(g, scenario.origin, scenario.destination, cost_model, limit=8)
    if not candidates:
        raise ValueError(f"No path found from {scenario.origin} to {scenario.destination}.")
    qubo = QUBOModel(candidates, penalty=20.0)
    error_note = None
    try:
        q = run_qiskit_qaoa(qubo, layers=2, shots=1024, seed=scenario.seed)
        qiskit_used = True
    except ModuleNotFoundError as exc:
        error_note = str(exc)
        q = QAOASimulator(scenario.seed).run(qubo, layers=2, shots=1024)
        qiskit_used = False
    except Exception as exc:
        error_note = f"Qiskit run failed: {type(exc).__name__}: {exc}"
        q = QAOASimulator(scenario.seed).run(qubo, layers=2, shots=1024)
        qiskit_used = False

    decoded_index = q.get("decoded_index")
    quantum_candidate = candidates[decoded_index] if decoded_index is not None and 0 <= decoded_index < len(candidates) else None
    # Classical feasibility repair/selection is part of the hybrid method. Since
    # candidates are sorted by the same objective, it can keep a feasible QAOA
    # route or improve it using the best enumerated feasible corridor.
    best_classical_candidate = min((row for row in candidates if row.get("feasible")), key=lambda row: row["objective"], default=None)
    valid_q_candidate = quantum_candidate is not None and bool(quantum_candidate.get("feasible"))
    if valid_q_candidate and best_classical_candidate is not None:
        chosen = min([quantum_candidate, best_classical_candidate], key=lambda row: row["objective"])
        repair_used = chosen is not quantum_candidate
    elif best_classical_candidate is not None:
        chosen = best_classical_candidate
        repair_used = True
    else:
        chosen = candidates[0]
        repair_used = True

    # Quantum route metadata is kept distinct from the post-processed hybrid route.
    q_candidate_out = None
    if quantum_candidate is not None:
        q_candidate_out = {**quantum_candidate, "algorithm": "Qiskit QAOA" if qiskit_used else "QAOA state-vector fallback"}
    return chosen, q, {
        "candidates": candidates,
        "fallback": not qiskit_used,
        "qiskit_used": qiskit_used,
        "quantum_candidate": q_candidate_out,
        "quantum_feasible_sampled": valid_q_candidate,
        "hybrid_repair_used": repair_used,
        "fallback_reason": error_note,
        "backend": q.get("backend", "unknown"),
        "total_runtime_ms": (time.perf_counter() - started) * 1000,
        "qubo_variables": qubo.n,
    }
