from __future__ import annotations
import time
import math
import networkx as nx


def _prepare_graph(g, scenario):
    """Return a search graph with prohibited synthetic edges removed."""
    graph = g.copy()
    if scenario.restricted_airspace:
        blocked = [(u, v) for u, v, data in graph.edges(data=True) if float(data.get("restriction", 0)) > 0]
        graph.remove_edges_from(blocked)
    return graph


def _solve(g, source, target, cost_model, scenario, algorithm):
    start = time.perf_counter()
    search_graph = _prepare_graph(g, scenario)
    weight = lambda u, v, data: cost_model.edge_cost(u, v, data)
    if algorithm == "Dijkstra":
        path = nx.shortest_path(search_graph, source, target, weight=weight)
    else:
        # Admissible lower bound: geometric straight-line distance is <= route
        # length, and each edge distance is at least 62 * coordinate distance.
        # Other objective terms are non-negative, so omitting them preserves a
        # lower-bound heuristic. If distance weight is zero, this is A* with h=0.
        distance_weight = max(0.0, float(scenario.distance_weight))
        scale = max(1.0, float(cost_model.scales["distance"]))
        def heuristic(a, b):
            dx = search_graph.nodes[a]["x"] - search_graph.nodes[b]["x"]
            dy = search_graph.nodes[a]["y"] - search_graph.nodes[b]["y"]
            return math.hypot(dx, dy) * 62.0 * distance_weight / scale
        path = nx.astar_path(search_graph, source, target, heuristic=heuristic, weight=weight)
    return path, (time.perf_counter() - start) * 1000


def solve_classical(g, scenario, cost_model):
    output = []
    for algorithm in ["Dijkstra", "A*"]:
        try:
            path, runtime = _solve(g, scenario.origin, scenario.destination, cost_model, scenario, algorithm)
            metrics = cost_model.path_metrics(path)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            path, runtime = [], 0.0
            metrics = {"distance_km": None, "fuel_kg": None, "co2_kg": None, "time_min": None, "congestion": None, "objective": None, "feasible": False}
        metrics["runtime_ms"] = runtime
        output.append((algorithm, path, metrics))
    return output
