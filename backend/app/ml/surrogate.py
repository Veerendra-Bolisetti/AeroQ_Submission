from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split


class SyntheticFuelModel:
    """Reproducible fuel-estimation research model trained on synthetic assumptions only."""
    FEATURE_NAMES = ["Distance", "Congestion", "Weather severity", "Wind component", "Fuel-burn assumption"]

    def __init__(self, seed=42):
        rng = np.random.default_rng(seed)
        n = 1800
        distance = rng.uniform(50, 450, n)
        congestion = rng.uniform(0, 1, n)
        weather = rng.uniform(0, 0.6, n)
        wind = rng.uniform(-0.8, 0.8, n)
        burn = rng.uniform(1.8, 3.4, n)
        X = np.c_[distance, congestion, weather, wind, burn]
        # Synthetic target formula with noise is intentionally disclosed to users.
        y = distance * burn * (1 + .07 * congestion + .05 * weather - .06 * wind) + rng.normal(0, 5, n)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=seed)
        self.model = RandomForestRegressor(n_estimators=80, random_state=seed, max_depth=10, n_jobs=-1)
        self.model.fit(X_train, y_train)
        pred = self.model.predict(X_test)
        self.test_r2 = float(r2_score(y_test, pred))
        self.r2 = self.test_r2  # backward-compatible field: now explicitly the held-out test R².
        self.mae = float(mean_absolute_error(y_test, pred))
        self.rmse = float(np.sqrt(mean_squared_error(y_test, pred)))
        self.baseline = Ridge(alpha=1.0).fit(X_train, y_train)
        self.baseline_mae = float(mean_absolute_error(y_test, self.baseline.predict(X_test)))
        self.feature_importances = [
            {"feature": name, "importance": float(value)}
            for name, value in zip(self.FEATURE_NAMES, self.model.feature_importances_)
        ]
        self.training_rows = int(len(X_train))
        self.test_rows = int(len(X_test))

    def predict_edge(self, data, scenario):
        X = np.array([[data["distance"], data["congestion"], data["weather"], data["wind"], scenario.fuel_burn_kg_per_km]])
        return float(self.model.predict(X)[0])

    def predict(self, distance, congestion, weather, wind, fuel_burn):
        X = np.array([[distance, congestion, weather, wind, fuel_burn]], dtype=float)
        return float(self.model.predict(X)[0])

    def info(self):
        return {
            "model": "RandomForestRegressor",
            "data_source": "synthetic demonstration data",
            "training_rows": self.training_rows,
            "test_rows": self.test_rows,
            "test_r2": self.test_r2,
            "mae_kg": self.mae,
            "rmse_kg": self.rmse,
            "ridge_baseline_mae_kg": self.baseline_mae,
            "feature_importances": self.feature_importances,
            "warning": "Metrics measure fit to a synthetic held-out dataset, not real airline operations.",
        }
