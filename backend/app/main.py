
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Rutas del proyecto
BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"

# Configurar imports de Python
sys.path.insert(0, str(BACKEND_DIR))

from app.controllers.forecast_controller import router as forecast_router

app = FastAPI(
    title="Coffee Shop Sales Forecast API",
    description="API para analizar y predecir ventas diarias.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Servir frontend
if FRONTEND_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIR), html=True),
        name="frontend"
    )
    print(f"Frontend encontrado: {FRONTEND_DIR}")
else:
    print(f"No se encontró el frontend: {FRONTEND_DIR}")
