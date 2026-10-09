"""Qiskit-backed QAOA for the reduced candidate-route QUBO.

This module is optional at import time so the application can still start on
machines where Qiskit has not yet been installed. It never disguises a fallback
as a Qiskit execution.
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
from scipy.optimize import minimize


def _qubo_to_ising(qubo: Any) -> tuple[float, np.ndarray, dict[tuple[int, int], float]]:
    """Translate E(x)=x'Qx+constant into offset + sum h_i Z_i + sum J_ij Z_iZ_j.

    QUBOModel stores the upper-triangular polynomial coefficients once, so each
    off-diagonal Q[i,j] is the coefficient of x_i*x_j (not twice that term).
    """
    n = qubo.n
    offset = float(qubo.penalty)
    h = np.zeros(n, dtype=float)
    couplings: dict[tuple[int, int], float] = {}
    for i in range(n):
        c = float(qubo.Q[i, i])
        offset += c / 2.0
        h[i] -= c / 2.0
    for i in range(n):
        for j in range(i + 1, n):
            qij = float(qubo.Q[i, j])
            if abs(qij) < 1e-12:
                continue
            offset += qij / 4.0
            h[i] -= qij / 4.0
            h[j] -= qij / 4.0
            couplings[(i, j)] = qij / 4.0
    return offset, h, couplings


def run_qiskit_qaoa(qubo: Any, layers: int = 2, shots: int = 1024, seed: int = 42) -> dict[str, Any]:
    """Run QAOA via Qiskit's QuantumCircuit and Statevector simulator.

    Qiskit's Statevector evaluates the parameterized circuit. SciPy COBYLA
    optimizes the expected QUBO energy. Measurement counts are sampled from the
    final statevector probabilities to provide repeatable local shot results.
    """
    try:
        from qiskit import QuantumCircuit
        from qiskit.quantum_info import Statevector
    except ImportError as exc:  # pragma: no cover - depends on local install
        raise ModuleNotFoundError("Qiskit is not installed; install requirements.txt to enable Qiskit QAOA.") from exc

    if not 1 <= layers <= 3:
        raise ValueError("QAOA layers must be between 1 and 3 for this local demonstrator")
    if not 1 <= qubo.n <= 10:
        raise ValueError("Qiskit statevector demo is limited to 1–10 qubits")

    started = time.perf_counter()
    n = qubo.n
    offset, h, couplings = _qubo_to_ising(qubo)
    energies = np.array(
        [qubo.energy([(state >> i) & 1 for i in range(n)]) for state in range(2**n)],
        dtype=float,
    )

    def make_circuit(params: np.ndarray) -> QuantumCircuit:
        gammas = params[:layers]
        betas = params[layers:]
        circuit = QuantumCircuit(n)
        circuit.h(range(n))
        for gamma, beta in zip(gammas, betas):
            # H_C = offset + Σ h_i Z_i + Σ J_ij Z_i Z_j.
            # RZ(2γh) and RZZ(2γJ) implement exp(-iγH_C); the offset is global phase.
            circuit.global_phase = circuit.global_phase - float(gamma * offset)
            for i, coefficient in enumerate(h):
                if abs(coefficient) > 1e-12:
                    circuit.rz(float(2.0 * gamma * coefficient), i)
            for (i, j), coefficient in couplings.items():
                if abs(coefficient) > 1e-12:
                    circuit.rzz(float(2.0 * gamma * coefficient), i, j)
            for i in range(n):
                circuit.rx(float(2.0 * beta), i)
        return circuit

    def expected_energy(params: np.ndarray) -> float:
        state = Statevector.from_instruction(make_circuit(params))
        probabilities = np.asarray(state.probabilities(), dtype=float)
        return float(np.dot(probabilities, energies))

    rng = np.random.default_rng(seed)
    initial = np.concatenate((rng.uniform(0.0, 2 * np.pi, layers), rng.uniform(0.0, np.pi, layers)))
    result = minimize(
        expected_energy,
        initial,
        method="COBYLA",
        options={"maxiter": 70, "rhobeg": 0.35, "tol": 1e-3},
    )
    circuit = make_circuit(np.asarray(result.x, dtype=float))
    final_state = Statevector.from_instruction(circuit)
    probabilities = np.asarray(final_state.probabilities(), dtype=float)
    probabilities = np.maximum(probabilities, 0.0)
    probabilities /= probabilities.sum()
    samples = rng.choice(2**n, size=int(shots), p=probabilities)

    counts: dict[str, int] = {}
    observed: set[int] = set()
    for state in samples:
        state_i = int(state)
        observed.add(state_i)
        bitstring = "".join(str((state_i >> i) & 1) for i in range(n))
        counts[bitstring] = counts.get(bitstring, 0) + 1

    # Only choose a QAOA-decoded route if a one-hot route selection was actually
    # observed in measurement samples. Do not use the unobserved global optimum.
    one_hot_states = [state for state in observed if sum((state >> i) & 1 for i in range(n)) == 1]
    selected_state = min(one_hot_states, key=lambda state: energies[state]) if one_hot_states else min(observed, key=lambda state: energies[state])
    bits = tuple((selected_state >> i) & 1 for i in range(n))
    decoded_index = next((i for i, bit in enumerate(bits) if bit), None) if sum(bits) == 1 else None

    return {
        "bits": bits,
        "decoded_index": decoded_index,
        "one_hot_found": bool(one_hot_states),
        "energy": float(energies[selected_state]),
        "expectation_energy": float(np.dot(probabilities, energies)),
        "probabilities": dict(sorted(counts.items(), key=lambda item: item[1], reverse=True)),
        "qubits": n,
        "layers": layers,
        "shots": int(shots),
        "gamma": [float(x) for x in result.x[:layers]],
        "beta": [float(x) for x in result.x[layers:]],
        "runtime_ms": (time.perf_counter() - started) * 1000.0,
        "backend": "Qiskit Statevector (local simulator)",
        "method": "QAOA + COBYLA",
        "optimizer_success": bool(result.success),
        "optimizer_message": str(result.message),
        "circuit_depth": int(circuit.depth()),
        "gate_count": int(circuit.size()),
        "ising": {"offset": float(offset), "h": h.tolist(), "couplings": {f"{i},{j}": float(v) for (i, j), v in couplings.items()}},
        "fallback": False,
    }
