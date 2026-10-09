from __future__ import annotations


def explain(classical, hybrid):
    """Generate an evidence-based description from computed route metrics."""
    baseline = min(classical, key=lambda item: item[2]["objective"])
    base_route, base_metrics = baseline[1], baseline[2]
    route = hybrid["route"]
    metrics = hybrid["metrics"]
    base_objective = float(base_metrics["objective"])
    new_objective = float(metrics["objective"])
    objective_delta = ((base_objective - new_objective) / base_objective * 100.0) if base_objective else 0.0
    fuel_delta = ((base_metrics["fuel_kg"] - metrics["fuel_kg"]) / base_metrics["fuel_kg"] * 100.0) if base_metrics["fuel_kg"] else 0.0
    co2_delta = ((base_metrics["co2_kg"] - metrics["co2_kg"]) / base_metrics["co2_kg"] * 100.0) if base_metrics["co2_kg"] else 0.0

    if route == base_route:
        return (
            f"The hybrid pipeline retained the same route as the best classical baseline: {route}. "
            f"Under the current synthetic assumptions, its weighted objective changed by {objective_delta:.2f}%, "
            f"estimated fuel changed by {fuel_delta:.2f}%, and estimated CO₂ changed by {co2_delta:.2f}%. "
            "This scenario does not demonstrate a route change or a quantum advantage."
        )

    reasons = []
    if metrics["distance_km"] < base_metrics["distance_km"]:
        reasons.append("shorter distance")
    elif metrics["distance_km"] > base_metrics["distance_km"]:
        reasons.append("longer distance")
    if metrics["congestion"] < base_metrics["congestion"] - 1e-9:
        reasons.append("lower average congestion")
    if metrics["fuel_kg"] < base_metrics["fuel_kg"] - 1e-9:
        reasons.append("lower estimated fuel burn")
    if metrics["co2_kg"] < base_metrics["co2_kg"] - 1e-9:
        reasons.append("lower estimated CO₂")
    if not reasons:
        reasons.append("the configured multi-objective cost weights")
    return (
        f"The hybrid pipeline selected {route}, while the best classical baseline selected {base_route}. "
        f"The computed difference reflects {', '.join(reasons)} under the current assumptions. "
        f"The weighted objective changed by {objective_delta:.2f}%, estimated fuel by {fuel_delta:.2f}%, "
        f"and estimated CO₂ by {co2_delta:.2f}%. These are simulation comparisons, not real-world savings claims."
    )
