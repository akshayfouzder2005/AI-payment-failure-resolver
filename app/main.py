"""
FastAPI application entrypoint.

Route modules are included here and nowhere else builds the app instance,
so there is one obvious place to see the full set of exposed endpoints.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ai_decisions, health, recovery, simulate, webhooks
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="Detects failed payments, gets an AI-backed recovery recommendation, "
    "validates it against deterministic policy, and executes the approved action.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(webhooks.router)
app.include_router(simulate.router)
app.include_router(ai_decisions.router)
app.include_router(recovery.router)


@app.get("/")
def root() -> dict:
    return {"service": settings.app_name, "status": "running"}
