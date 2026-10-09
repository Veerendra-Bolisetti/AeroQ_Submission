import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.app.api.routes import router

app = FastAPI(
    title="AeroQ API",
    version="2.0.0",
    description="Quantum-assisted low-emission flight-path optimisation research simulator. Synthetic data only.",
)

# CORS: allow local dev and any Render / custom frontend origins
_cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
_extra = os.environ.get("CORS_ORIGINS", "")
if _extra:
    _cors_origins.extend([o.strip() for o in _extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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


# ---------- Serve frontend in production ----------
# When the Vite build output exists, serve it as static files.
# API routes (/api/*) take priority since the router is included first.
_frontend_dist = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="static-assets")

    # Catch-all: serve index.html for SPA routing
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = _frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_frontend_dist / "index.html"))

