def calculate_emissions(distance_km, fuel_burn_kg_per_km, efficiency=1.0, wind_factor=0.0, payload_factor=1.0):
    fuel = distance_km * fuel_burn_kg_per_km * efficiency * payload_factor * (1 - 0.06*wind_factor)
    return {"fuel_kg":fuel,"co2_kg":fuel*3.16}
