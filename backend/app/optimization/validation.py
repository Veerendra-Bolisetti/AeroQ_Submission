from __future__ import annotations
import networkx as nx

def validate_route(g: nx.Graph, route, origin, destination, max_distance_km):
    errors=[]
    if not route or route[0] != origin or route[-1] != destination:
        errors.append('origin/destination mismatch')
    distance=0.0
    for u,v in zip(route,route[1:]):
        if not g.has_edge(u,v): errors.append(f'missing edge {u}-{v}'); continue
        distance += g[u][v]['distance']
        if g[u][v]['restriction']>0: errors.append(f'restricted edge {u}-{v}')
    if distance > max_distance_km: errors.append('maximum route distance exceeded')
    return {'feasible':not errors,'errors':errors,'distance_km':distance}
