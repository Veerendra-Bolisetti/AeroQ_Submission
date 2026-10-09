from __future__ import annotations
import math
from dataclasses import dataclass
import networkx as nx

@dataclass
class Weights:
    distance: float = 1.0
    fuel: float = 1.0
    emission: float = 1.0
    congestion: float = 1.0
    delay: float = 1.0
    weather: float = 1.0

class CostModel:
    def __init__(self, graph: nx.Graph, scenario, ml_predictor=None):
        self.g = graph
        self.s = scenario
        self.ml_predictor = ml_predictor
        self.weights = Weights(scenario.distance_weight, scenario.fuel_weight, scenario.emission_weight,
                               scenario.congestion_weight, scenario.delay_weight, scenario.weather_weight)
        self.scales = self._scales()
        if self.ml_predictor is not None:
            for _, _, data in self.g.edges(data=True):
                data["ml_fuel_kg"] = self.ml_predictor.predict_edge(data, self.s)

    def _scales(self):
        vals = list(self.g.edges(data=True))
        return {
            "distance": max(d["distance"] for _,_,d in vals),
            "fuel": max(d["fuel_kg"] for _,_,d in vals),
            "emission": max(d["co2_kg"] for _,_,d in vals),
            "congestion": 1.0, "delay": 1.0, "weather": max(1.0, max(d["weather"] for _,_,d in vals))
        }

    def edge_cost(self, u, v, data):
        ml_bonus = 0.0
        if self.ml_predictor is not None:
            predicted = data.get("ml_fuel_kg", data["fuel_kg"])
            ml_bonus = 0.10 * predicted / max(1.0, data["fuel_kg"])
        c = (
            self.weights.distance * data["distance"] / self.scales["distance"] +
            self.weights.fuel * data["fuel_kg"] / self.scales["fuel"] +
            self.weights.emission * data["co2_kg"] / self.scales["emission"] +
            self.weights.congestion * data["congestion"] +
            self.weights.delay * data["delay"] +
            self.weights.weather * data["weather"] / self.scales["weather"] +
            8.0 * data["restriction"] + ml_bonus
        )
        return c

    def path_metrics(self, path):
        edges = [self.g.get_edge_data(path[i], path[i+1]) for i in range(len(path)-1)]
        distance = sum(e["distance"] for e in edges)
        fuel = sum(e["fuel_kg"] for e in edges)
        co2 = sum(e["co2_kg"] for e in edges)
        time = sum(e["time_min"] for e in edges)
        congestion = sum(e["congestion"] for e in edges) / max(1,len(edges))
        objective = sum(self.edge_cost(path[i],path[i+1],edges[i]) for i in range(len(edges)))
        feasible = distance <= self.s.max_distance_km and not any(e["restriction"] > 0 for e in edges)
        return dict(distance_km=distance,fuel_kg=fuel,co2_kg=co2,time_min=time,congestion=congestion,objective=objective,feasible=feasible)
