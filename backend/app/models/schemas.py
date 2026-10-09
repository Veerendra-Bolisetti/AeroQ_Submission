from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class ScenarioRequest(BaseModel):
    origin: str = "A01"
    destination: str = "A10"
    aircraft_category: str = "Narrow-body"
    cruise_speed_kmh: float = 820
    fuel_burn_kg_per_km: float = 2.55
    max_distance_km: float = 1100
    wind_condition: float = 0.0  # -1 headwind, +1 tailwind
    weather_penalty: float = 0.10
    congestion_level: float = 0.25
    restricted_airspace: bool = True
    delay_sensitivity: float = 0.30
    emission_weight: float = 1.0
    fuel_weight: float = 1.0
    distance_weight: float = 1.0
    congestion_weight: float = 1.0
    delay_weight: float = 1.0
    weather_weight: float = 1.0
    scenario_name: str = "Normal conditions"
    use_ml_cost: bool = True
    seed: int = 42

class WeightRequest(BaseModel):
    emission_weight: float = 1.0
    fuel_weight: float = 1.0
    distance_weight: float = 1.0
    congestion_weight: float = 1.0
    delay_weight: float = 1.0
    weather_weight: float = 1.0

class RouteResult(BaseModel):
    algorithm: str
    route: List[str]
    distance_km: float
    fuel_kg: float
    co2_kg: float
    time_min: float
    congestion: float
    objective: float
    runtime_ms: float
    feasible: bool = True
    explanation: Optional[str] = None

class OptimizationResponse(BaseModel):
    scenario: str
    graph: Dict
    classical: List[RouteResult]
    hybrid: RouteResult
    quantum: RouteResult
    comparison: Dict
    explanation: str
    quantum_details: Dict
    ml_details: Dict
