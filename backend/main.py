"""CareCompass API entry point.

Run from the backend/ folder:
    python -m db.seed          (first time only — creates and seeds the DB)
    uvicorn main:app --reload  (starts the API at http://localhost:8000)

Interactive docs: http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import Base, engine
from routers import ai, auth, benefits, eligibility, screenings

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CareCompass API", version="0.1.0")

# Allow the Vite dev server to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(eligibility.router)
app.include_router(screenings.router)
app.include_router(benefits.router)
app.include_router(ai.router)


@app.get("/")
def root():
    return {"message": "CareCompass API is running. See /docs for endpoints."}
