export type TabId =
  | 'dashboard' | 'scenario' | 'optimisation' | 'quantum' | 'ml'
  | 'comparison' | 'sensitivity' | 'experiments' | 'methodology';

export interface ScenarioRequest {
  origin: string;
  destination: string;
  aircraft_category: string;
  cruise_speed_kmh: number;
  fuel_burn_kg_per_km: number;
  max_distance_km: number;
  wind_condition: number;
  weather_penalty: number;
  congestion_level: number;
  restricted_airspace: boolean;
  delay_sensitivity: number;
  emission_weight: number;
  fuel_weight: number;
  distance_weight: number;
  congestion_weight: number;
  delay_weight: number;
  weather_weight: number;
  scenario_name: string;
  use_ml_cost: boolean;
  seed: number;
}

export interface GraphNode {
  id: string; x: number; y: number; kind: 'airport' | 'waypoint' | string;
}
export interface GraphEdge {
  source: string; target: string; distance: number; time_min: number; fuel_kg: number;
  co2_kg: number; wind: number; congestion: number; weather: number; restriction: number; delay: number;
  ml_fuel_kg?: number;
}
export interface AirspaceGraph { nodes: GraphNode[]; edges: GraphEdge[] }
export interface RouteResult {
  algorithm: string; route: string[]; distance_km: number | null; fuel_kg: number | null;
  co2_kg: number | null; time_min: number | null; congestion: number | null;
  objective: number | null; runtime_ms: number | null; feasible: boolean; explanation?: string;
}
export interface QuboResult { variables: string[]; Q: number[][]; penalty: number }
export interface QaoaSimulation {
  bits: number[] | string; decoded_index?: number | null; one_hot_found?: boolean;
  energy: number; expectation_energy: number; probabilities: Record<string, number>;
  qubits: number; layers: number; shots: number; gamma: number | number[]; beta: number | number[];
  runtime_ms: number; backend: string; method?: string; fallback?: boolean;
  optimizer_success?: boolean; optimizer_message?: string; circuit_depth?: number; gate_count?: number;
  fallback_reason?: string;
}
export interface CandidateRoute {
  route: string[]; distance_km: number; fuel_kg: number; co2_kg: number; time_min: number;
  congestion: number; objective: number; feasible: boolean;
}
export interface OptimizationResponse {
  scenario: string; graph: AirspaceGraph; classical: RouteResult[]; hybrid: RouteResult;
  quantum: RouteResult; comparison: Record<string, number>; explanation: string;
  quantum_details: { qubo: QuboResult; simulation: QaoaSimulation; meta: Record<string, unknown> };
  candidate_routes: CandidateRoute[];
  ml_details: {
    enabled: boolean; model?: string; data_source?: string; training_rows?: number; test_rows?: number;
    test_r2?: number; training_r2?: number; mae_kg?: number; rmse_kg?: number;
    ridge_baseline_mae_kg?: number; feature_importances?: { feature: string; importance: number }[]; warning?: string;
  };
  experiment?: ExperimentRecord;
}
export interface SensitivityPoint {
  emission_weight: number; route: string[]; objective: number; co2_kg: number; fuel_kg: number;
}
export interface SensitivityResponse { results: SensitivityPoint[] }
export interface ExperimentRecord {
  id: string; created_at: string; scenario: string; classical_algorithm?: string;
  hybrid_route: string[]; distance_km: number | null; fuel_kg: number | null;
  co2_kg: number | null; objective: number | null; quantum_backend?: string; qiskit_used?: boolean;
}
export interface ExperimentsResponse { experiments: ExperimentRecord[] }
export interface HealthResponse { status: string; project: string; mode: string; api_version?: string }
export interface ModelInfo {
  model: string; data_source: string; training_rows: number; test_rows: number; test_r2: number;
  mae_kg: number; rmse_kg: number; ridge_baseline_mae_kg: number;
  feature_importances: { feature: string; importance: number }[]; warning: string;
}
