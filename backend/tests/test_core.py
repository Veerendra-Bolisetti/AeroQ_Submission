from backend.app.models.schemas import ScenarioRequest
from backend.app.services.graph_service import AirspaceGraph
from backend.app.services.cost_service import CostModel
from backend.app.optimization.classical import solve_classical
from backend.app.optimization.hybrid import solve_hybrid
from backend.app.quantum.qubo import QUBOModel
from backend.app.emissions.model import calculate_emissions

def test_graph_generation():
    s=ScenarioRequest(); g=AirspaceGraph(s.seed).build(s)
    assert len(g.nodes)>=10 and len(g.edges)>=20

def test_classical_algorithms():
    s=ScenarioRequest(); g=AirspaceGraph(s.seed).build(s); c=CostModel(g,s)
    r=solve_classical(g,s,c)
    assert len(r)==2 and all(x[2]["feasible"] for x in r)

def test_qubo():
    q=QUBOModel([{"objective":1},{"objective":2},{"objective":3}])
    e,b=q.brute_force(); assert sum(b)==1

def test_hybrid():
    s=ScenarioRequest(); g=AirspaceGraph(s.seed).build(s); c=CostModel(g,s)
    chosen,q,m=solve_hybrid(g,s,c)
    assert chosen["feasible"] and len(q["bits"])<=8

def test_emissions():
    r=calculate_emissions(100,2.5)
    assert r["fuel_kg"]>0 and r["co2_kg"]>r["fuel_kg"]

def test_route_validation_and_api():
    from fastapi.testclient import TestClient
    from backend.app.main import app
    c=TestClient(app)
    assert c.get('/api/health').status_code==200
    assert c.get('/api/scenarios').status_code==200
    r=c.post('/api/optimize',json={})
    assert r.status_code==200
    j=r.json(); assert j['hybrid']['feasible'] and j['quantum_details']['qubo']['penalty']==20.0

def test_qubo_ising_translation_matches_binary_energy():
    from itertools import product
    from backend.app.quantum.qiskit_runner import _qubo_to_ising
    q = QUBOModel([{"objective": 1.1}, {"objective": 2.4}, {"objective": 0.7}], penalty=6.0)
    offset, h, couplings = _qubo_to_ising(q)
    for bits in product([0, 1], repeat=q.n):
        z = [1 - 2 * b for b in bits]
        energy = offset + sum(h[i] * z[i] for i in range(q.n))
        energy += sum(c * z[i] * z[j] for (i, j), c in couplings.items())
        assert abs(energy - q.energy(bits)) < 1e-9


def test_optimization_response_labels_quantum_backend_honestly():
    from fastapi.testclient import TestClient
    from backend.app.main import app
    client = TestClient(app)
    response = client.post('/api/optimize', json={})
    assert response.status_code == 200
    body = response.json()
    sim = body['quantum_details']['simulation']
    assert sim['backend']
    if sim.get('fallback'):
        assert 'fallback' in sim['backend'].lower()
    assert body['hybrid']['route'][0] == 'A01'
    assert body['hybrid']['route'][-1] == 'A10'


def test_experiments_endpoint():
    from fastapi.testclient import TestClient
    from backend.app.main import app
    client = TestClient(app)
    assert client.get('/api/experiments').status_code == 200
    assert isinstance(client.get('/api/experiments').json()['experiments'], list)


def test_qiskit_qaoa_local_statevector_when_dependency_installed():
    import importlib.util
    import pytest
    if importlib.util.find_spec("qiskit") is None:
        pytest.skip("Qiskit is not installed in this environment; local install runs this integration test.")
    from backend.app.quantum.qiskit_runner import run_qiskit_qaoa
    q = QUBOModel([{"objective": 1.0}, {"objective": 1.8}, {"objective": 2.5}], penalty=8.0)
    result = run_qiskit_qaoa(q, layers=1, shots=64, seed=7)
    assert result["backend"].startswith("Qiskit Statevector")
    assert result["qubits"] == 3
    assert len(result["probabilities"]) > 0
    if result["one_hot_found"]:
        assert sum(result["bits"]) == 1


def test_restricted_edges_are_not_used_by_classical_search():
    scenario = ScenarioRequest(restricted_airspace=True)
    graph = AirspaceGraph(scenario.seed).build(scenario)
    cost = CostModel(graph, scenario)
    for _, route, metrics in solve_classical(graph, scenario, cost):
        assert route and route[0] == scenario.origin and route[-1] == scenario.destination
        assert metrics['feasible']
        assert not any(graph.get_edge_data(route[i], route[i + 1])['restriction'] > 0 for i in range(len(route) - 1))


def test_explanation_does_not_claim_a_route_change_when_routes_match():
    from backend.app.services.explanation import explain
    route = ['A01', 'N03', 'A10']
    metrics = {'distance_km': 100.0, 'fuel_kg': 200.0, 'co2_kg': 632.0, 'time_min': 10.0, 'congestion': 0.2, 'objective': 3.0}
    message = explain([('Dijkstra', route, metrics), ('A*', route, metrics)], {'route': route, 'metrics': metrics})
    assert 'same route' in message
    assert 'quantum advantage' in message
    assert 'instead of' not in message
