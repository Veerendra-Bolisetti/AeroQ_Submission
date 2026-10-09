from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api.routes import router

app = FastAPI(
    title="AeroQ API",
    version="2.0.0",
    description="Quantum-assisted low-emission flight-path optimisation research simulator. Synthetic data only.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/")
def root():
    return {
        "name": "AeroQ",
        "version": "2.0.0",
        "message": "Quantum-Assisted Low-Emission Flight Path Optimisation",
        "mode": "research and simulation demonstrator",
        "disclaimer": "Not certified aviation navigation, flight planning, or air-traffic-control advice.",
    }
