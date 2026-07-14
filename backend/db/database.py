"""Database connection setup.

Uses SQLite by default so the project runs with zero configuration.
To switch to PostgreSQL for the final, set the DATABASE_URL environment
variable, e.g. postgresql://user:password@localhost:5432/carecompass
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./carecompass_v3.db")
# v3 filename: added disability_details and disability_other_text columns to
# screenings. SQLite's create_all cannot ALTER existing tables, so a fresh
# filename gives local and Render deployments a clean, correctly-shaped DB.

# check_same_thread is only needed for SQLite
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that opens a session per request and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
