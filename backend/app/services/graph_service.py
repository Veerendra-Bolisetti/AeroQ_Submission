from __future__ import annotations
import math
import random
from typing import Dict, Tuple
import networkx as nx

NODE_LAYOUT = {
    "A01": (0.0, 0.0), "N02": (1.4, 1.2), "N03": (2.8, 0.3),
    "N04": (2.0, 2.8), "N05": (4.2, 2.0), "N06": (4.8, 0.2),
    "N07": (5.9, 3.3), "N08": (7.0, 1.1), "N09": (7.8, 3.4),
    "A10": (9.2, 1.8), "N11": (6.2, 5.0), "N12": (3.5, 4.6),
}
EDGES = [
    ("A01","N02"),("A01","N03"),("A01","N04"),("N02","N03"),
    ("N02","N04"),("N02","N12"),("N03","N05"),("N03","N06"),
    ("N04","N05"),("N04","N12"),("N12","N05"),("N12","N11"),
    ("N05","N06"),("N05","N07"),("N05","N11"),("N06","N08"),
    ("N07","N08"),("N07","N09"),("N07","N11"),("N08","N09"),
    ("N08","A10"),("N09","A10"),("N11","N09"),("N11","A10"),
]

class AirspaceGraph:
    def __init__(self, seed: int = 42):
        self.seed = seed
        self.rng = random.Random(seed)

    def build(self, scenario) -> nx.Graph:
        g = nx.Graph()
        for node, pos in NODE_LAYOUT.items():
            g.add_node(node, x=pos[0], y=pos[1], kind="airport" if node.startswith("A") else "waypoint")
        for u, v in EDGES:
            x1,y1 = NODE_LAYOUT[u]; x2,y2 = NODE_LAYOUT[v]
            dist = math.hypot(x2-x1, y2-y1) * 62 + 38
            congestion = min(1.0, scenario.congestion_level + self.rng.uniform(-0.10, 0.18))
            wind = max(-0.8, min(0.8, scenario.wind_condition + self.rng.uniform(-0.15, 0.15)))
            weather = max(0.0, scenario.weather_penalty + self.rng.uniform(-0.04, 0.08))
            restricted = 1.0 if scenario.restricted_airspace and {u,v} in [set(x) for x in [("N04","N05"),("N07","N09")]] else 0.0
            delay = min(1.0, 0.10 + congestion*0.55 + scenario.delay_sensitivity*0.20)
            speed_factor = max(0.70, min(1.20, 1.0 - wind*0.22))
            time_min = dist / (scenario.cruise_speed_kmh * speed_factor) * 60
            fuel = dist * scenario.fuel_burn_kg_per_km * (1 + congestion*0.07 + weather*0.05 - wind*0.06)
            co2 = fuel * 3.16
            g.add_edge(u,v,distance=dist,time_min=time_min,fuel_kg=fuel,co2_kg=co2,wind=wind,
                       congestion=congestion,weather=weather,restriction=restricted,delay=delay)
        return g

    @staticmethod
    def serialise(g: nx.Graph) -> Dict:
        return {
            "nodes": [{"id": n, "x": d["x"], "y": d["y"], "kind": d["kind"]} for n,d in g.nodes(data=True)],
            "edges": [{"source":u,"target":v, **{k: round(val,4) for k,val in d.items()}} for u,v,d in g.edges(data=True)]
        }
