"""SQLAlchemy table models. These match the Schema Design in the project spec."""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from db.database import Base


class Benefit(Base):
    __tablename__ = "benefits"

    benefit_id = Column(Integer, primary_key=True, index=True)
    program_key = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    eligibility_summary = Column(Text, nullable=False)
    program_type = Column(String, nullable=False)
    apply_url = Column(String, nullable=True)
    is_federal = Column(Boolean, nullable=False, default=True)
    is_supplemental = Column(Boolean, nullable=False, default=False)

    rules = relationship("EligibilityRule", back_populates="benefit", cascade="all, delete-orphan")
    requirements = relationship(
        "Requirement",
        back_populates="benefit",
        cascade="all, delete-orphan",
        order_by="Requirement.display_order",
    )


class EligibilityRule(Base):
    """One row = one qualifying path. Multiple rows per benefit act as OR logic."""

    __tablename__ = "eligibility_rules"

    rule_id = Column(Integer, primary_key=True, index=True)
    benefit_id = Column(Integer, ForeignKey("benefits.benefit_id", ondelete="CASCADE"), nullable=False)
    min_age = Column(Integer, nullable=True)
    max_age = Column(Integer, nullable=True)
    max_income = Column(Integer, nullable=True)  # annual dollars for a 1-person household
    income_per_extra_person = Column(Integer, nullable=True)  # added per extra household member
    requires_disability = Column(Boolean, nullable=False, default=False)
    requires_veteran = Column(Boolean, nullable=False, default=False)
    state = Column(String, nullable=True)  # two-letter code, NULL = nationwide
    requires_coverage = Column(String, nullable=True)  # e.g. "medicare", NULL = none

    benefit = relationship("Benefit", back_populates="rules")


class Requirement(Base):
    __tablename__ = "requirements"

    requirement_id = Column(Integer, primary_key=True, index=True)
    benefit_id = Column(Integer, ForeignKey("benefits.benefit_id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)

    benefit = relationship("Benefit", back_populates="requirements")


class User(Base):
    """Registered account. Matches the optional users table from the spec."""

    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=True)

    screenings = relationship("Screening", back_populates="user", cascade="all, delete-orphan")


class Screening(Base):
    """A saved eligibility check — the user-generated CRUD resource.
    Users can create, list, rename (update), and delete their screenings.
    Array/list fields are stored as JSON strings for SQLite compatibility."""

    __tablename__ = "screenings"

    screening_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False, default="My screening")
    age = Column(Integer, nullable=False)
    income = Column(Integer, nullable=False)
    state = Column(String, nullable=False)
    household_size = Column(Integer, nullable=False, default=1)
    disability_status = Column(Boolean, nullable=False, default=False)
    veteran_status = Column(Boolean, nullable=False, default=False)
    insurance_status = Column(Boolean, nullable=False, default=False)
    current_coverage = Column(Text, nullable=False, default="[]")  # JSON list
    matched_benefits = Column(Text, nullable=False, default="[]")  # JSON list

    user = relationship("User", back_populates="screenings")
