from __future__ import annotations
import time
import numpy as np

class QAOASimulator:
    """Dependency-light local state-vector QAOA demonstrator.

    Used only when Qiskit is not installed or its runner fails. This is an
    explicit NumPy simulator fallback, not a Qiskit execution or hardware run.
    """
    def __init__(self, seed=42):
        self.rng = np.random.default_rng(seed)

    def _energies(self, qubo):
        n = qubo.n
        return np.array([qubo.energy([(s >> i) & 1 for i in range(n)]) for s in range(2**n)], dtype=float)

    @staticmethod
    def _mixer(state, n, beta):
        c = np.cos(beta); s = -1j * np.sin(beta)
        out = state.copy()
        for q in range(n):
            bit = 1 << q
            new = out.copy()
            for base in range(len(out)):
                if base & bit == 0:
                    j = base | bit
                    a, b = out[base], out[j]
                    new[base] = c*a + s*b
                    new[j] = s*a + c*b
            out = new
        return out

    def _state(self, energies, n, gammas, betas):
        state = np.ones(2**n, dtype=complex) / np.sqrt(2**n)
        for gamma, beta in zip(gammas, betas):
            state *= np.exp(-1j * gamma * energies)
            state = self._mixer(state, n, beta)
        return state

    def run(self, qubo, layers=2, shots=1024):
        start = time.perf_counter(); n = qubo.n
        if n > 10:
            raise ValueError("Circuit demo limited to <=10 qubits")
        energies = self._energies(qubo)
        grid = np.linspace(0.0, np.pi, 5, endpoint=False)
        best = (float("inf"), None, None)
        for gamma in grid:
            for beta in grid:
                state = self._state(energies, n, [gamma]*layers, [beta]*layers)
                probs = np.abs(state)**2
                expectation = float(np.dot(probs, energies))
                if expectation < best[0]: best = (expectation, gamma, beta)
        _, gamma, beta = best
        state = self._state(energies, n, [gamma]*layers, [beta]*layers)
        probs = np.abs(state)**2; probs /= probs.sum()
        samples = self.rng.choice(len(probs), size=shots, p=probs)
        observed = set(int(s) for s in samples)
        one_hot = [s for s in observed if sum((s >> i) & 1 for i in range(n)) == 1]
        best_state = min(one_hot, key=lambda s: energies[s]) if one_hot else min(observed, key=lambda s: energies[s])
        counts = {}
        for s in samples:
            b = ''.join(str((int(s) >> i) & 1) for i in range(n))
            counts[b] = counts.get(b, 0) + 1
        bits = tuple((best_state >> i) & 1 for i in range(n))
        decoded_index = next((i for i,b in enumerate(bits) if b), None) if sum(bits) == 1 else None
        return {
            "bits": bits, "decoded_index": decoded_index, "one_hot_found": bool(one_hot),
            "energy": float(energies[best_state]), "expectation_energy": float(np.dot(probs, energies)),
            "probabilities": dict(sorted(counts.items(), key=lambda item: item[1], reverse=True)),
            "qubits": n, "layers": layers, "shots": shots, "gamma": float(gamma), "beta": float(beta),
            "runtime_ms": (time.perf_counter()-start)*1000, "backend": "NumPy state-vector QAOA fallback (Qiskit unavailable)",
            "method": "QAOA-style state-vector fallback", "fallback": True,
        }
