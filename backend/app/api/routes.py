from fastapi import APIRouter, HTTPException, Query
from backend.app.models.schemas import ScenarioRequest
from backend.app.services.optimizer_service import OptimizerService
from backend.app.services.graph_service import AirspaceGraph
from backend.app.ml.surrogate import SyntheticFuelModel
from backend.app.services.experiment_store import list_experiments, save_experiment

router = APIRouter(prefix="/api")
service = OptimizerService()

SCENARIOS = {
    "normal": {"scenario_name": "Normal conditions", "congestion_level": 0.20, "wind_condition": 0.15, "weather_penalty": 0.08, "restricted_airspace": False},
    "congestion": {"scenario_name": "High congestion", "congestion_level": 0.75, "wind_condition": 0.0, "weather_penalty": 0.10, "restricted_airspace": False},
    "headwind": {"scenario_name": "Strong headwind", "congestion_level": 0.25, "wind_condition": -0.70, "weather_penalty": 0.12, "restricted_airspace": False},
    "restricted": {"scenario_name": "Restricted airspace", "congestion_level": 0.30, "wind_condition": 0.10, "weather_penalty": 0.08, "restricted_airspace": True},
    "emissions": {"scenario_name": "Emissions priority", "congestion_level": 0.25, "wind_condition": 0.1, "weather_penalty": 0.08, "restricted_airspace": False, "emission_weight": 2.5, "fuel_weight": 1.6},
    "fuel": {"scenario_name": "Fuel priority", "congestion_level": 0.25, "wind_condition": 0.1, "weather_penalty": 0.08, "restricted_airspace": False, "fuel_weight": 2.5, "emission_weight": 1.0},
}


@router.get("/health")
def health():
    return {"status": "ok", "project": "AeroQ", "mode": "research simulation", "api_version": "1.1"}


@router.get("/scenarios")
def scenarios():
    return SCENARIOS


@router.post("/graph/generate")
def generate_graph(req: ScenarioRequest):
    try:
        graph = AirspaceGraph(req.seed).build(req)
        return {"scenario": req.scenario_name, "graph": AirspaceGraph.serialise(graph)}
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/optimize")
def optimize(req: ScenarioRequest):
    try:
        result = service.run(req)
        experiment = save_experiment(req.scenario_name, result)
        result["experiment"] = experiment
        return result
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Optimisation failed: {type(exc).__name__}: {exc}") from exc


@router.post("/optimize/classical")
def optimize_classical(req: ScenarioRequest):
    return optimize(req)["classical"]


@router.post("/qubo/build")
def build_qubo(req: ScenarioRequest):
    return optimize(req)["quantum_details"]["qubo"]


@router.post("/quantum/qaoa")
def run_qaoa(req: ScenarioRequest):
    result = optimize(req)
    return {"quantum": result["quantum"], "quantum_details": result["quantum_details"]}


@router.post("/optimize/hybrid")
def optimize_hybrid(req: ScenarioRequest):
    result = optimize(req)
    return {"hybrid": result["hybrid"], "quantum_details": result["quantum_details"], "explanation": result["explanation"]}


@router.post("/optimize/compare")
def compare(req: ScenarioRequest):
    result = optimize(req)
    return {key: result[key] for key in ("classical", "quantum", "hybrid", "comparison", "explanation", "quantum_details")}


@router.post("/sensitivity")
def sensitivity(req: ScenarioRequest):
    results = []
    for weight in [0.25, 0.75, 1.0, 1.5, 2.0]:
        updated = req.model_copy(update={"emission_weight": weight})
        out = service.run(updated)
        results.append({"emission_weight": weight, "route": out["hybrid"]["route"], "objective": out["hybrid"]["objective"], "co2_kg": out["hybrid"]["co2_kg"], "fuel_kg": out["hybrid"]["fuel_kg"]})
    return {"results": results}


@router.get("/experiments")
def experiments(limit: int = Query(default=50, ge=1, le=200)):
    return {"experiments": list_experiments(limit)}


@router.post("/ml/predict")
def ml_predict(req: ScenarioRequest):
    model = SyntheticFuelModel(req.seed)
    estimate = model.predict(250.0, req.congestion_level, req.weather_penalty, req.wind_condition, req.fuel_burn_kg_per_km)
    return {"estimate_fuel_kg": estimate, "model_info": model.info(), "assumptions": "Synthetic example segment: 250 km. Not an operational fuel prediction."}


@router.get("/ml/model-info")
def ml_model_info(seed: int = 42):
    return SyntheticFuelModel(seed).info()


@router.get("/methodology")
def methodology():
    return {
        "project": "AeroQ — Quantum-Assisted Low-Emission Flight Path Optimisation",
        "disclaimer": "Research and simulation prototype only. Not certified flight-planning, navigation or air-traffic-control advice.",
        "classical": ["Dijkstra", "A*"],
        "qubo": "Small candidate-route QUBO with a one-hot selection penalty: E(x)=sum(c_i*x_i)+P*(sum(x_i)-1)^2.",
        "qaoa": "Parameterized cost and X-mixer circuit; COBYLA tunes parameters. Qiskit Statevector is used when installed, otherwise an explicitly labelled NumPy state-vector fallback is used.",
        "ml": "Random Forest is trained and evaluated only on reproducible synthetic data.",
        "emissions": "Fuel and CO2 use documented synthetic assumptions. CO2 factor is 3.16 kg per kg fuel for this demonstrator.",
    }
