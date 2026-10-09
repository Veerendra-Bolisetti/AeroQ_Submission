from __future__ import annotations
import itertools
import numpy as np

class QUBOModel:
    """Candidate-route QUBO: one binary variable per candidate route.

    Energy E(x)=sum_i c_i x_i + P(sum_i x_i - 1)^2.
    This is a deliberately small reduction suitable for circuit simulation.
    """
    def __init__(self, candidates, penalty=3.0):
        self.candidates=candidates
        self.penalty=penalty
        self.n=len(candidates)
        self.Q=np.zeros((self.n,self.n),dtype=float)
        for i,c in enumerate(candidates):
            self.Q[i,i] += c["objective"] - penalty
        for i in range(self.n):
            for j in range(i+1,self.n):
                self.Q[i,j] += 2*penalty

    def energy(self,bits):
        x=np.asarray(bits,dtype=float)
        return float(x @ self.Q @ x + self.penalty)

    def brute_force(self):
        best=None
        for bits in itertools.product([0,1], repeat=self.n):
            if sum(bits)!=1: continue
            e=self.energy(bits)
            if best is None or e<best[0]: best=(e,bits)
        return best

    def as_dict(self):
        return {"variables":[f"x_{i}" for i in range(self.n)],"Q":np.round(self.Q,5).tolist(),"penalty":self.penalty}
