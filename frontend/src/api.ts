import type {
  ExperimentsResponse, HealthResponse, ModelInfo, OptimizationResponse,
  ScenarioRequest, SensitivityResponse,
} from './types';

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('Backend disconnected. Start the AeroQ FastAPI server at http://127.0.0.1:8000.');
  }
  if (!response.ok) {
    let detail = `API request failed (${response.status})`;
    try {
      const body = await response.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch { /* Keep the HTTP fallback message. */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  optimize: (scenario: ScenarioRequest) => request<OptimizationResponse>('/optimize', { method: 'POST', body: JSON.stringify(scenario) }),
  sensitivity: (scenario: ScenarioRequest) => request<SensitivityResponse>('/sensitivity', { method: 'POST', body: JSON.stringify(scenario) }),
  experiments: () => request<ExperimentsResponse>('/experiments'),
  modelInfo: () => request<ModelInfo>('/ml/model-info'),
};
