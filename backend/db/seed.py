"""Seed the database with the four MVP programs.

Run once:  python -m db.seed

Income limits are approximations of 2025 federal guidelines so the demo
behaves realistically. Verify current numbers before your final demo —
they change every year (this is also flagged in the project spec).
"""
from db.database import Base, SessionLocal, engine
from db.models import Benefit, EligibilityRule, Requirement

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    if db.query(Benefit).count() > 0:
        print("Database already seeded, skipping.")
        db.close()
        return

    medicaid = Benefit(
        program_key="medicaid",
        name="Medicaid",
        description=(
            "Medicaid provides free or low-cost health coverage to eligible "
            "low-income adults, elderly adults, and people with disabilities. "
            "It covers doctor visits, hospital stays, prescriptions, and more."
        ),
        eligibility_summary="Free or low-cost health coverage for people with limited income.",
        program_type="medicaid",
        apply_url="https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip/index.html",
        is_federal=True,
        is_supplemental=False,
        rules=[
            # Path 1: income-based (roughly 138% FPL, scaled by household size)
            EligibilityRule(max_income=21597, income_per_extra_person=7696),
            # Path 2: disability-based with a higher income allowance
            EligibilityRule(requires_disability=True, max_income=32000, income_per_extra_person=7696),
        ],
        requirements=[
            Requirement(description="Proof of identity (driver's license or state ID)", display_order=1),
            Requirement(description="Proof of income (pay stubs, tax return, or benefits letter)", display_order=2),
            Requirement(description="Proof of state residency", display_order=3),
        ],
    )

    part_b = Benefit(
        program_key="medicare_part_b",
        name="Medicare Part B",
        description=(
            "Medicare Part B covers doctor visits, outpatient care, preventive "
            "services, and some medical equipment for people 65 and older or "
            "those with qualifying disabilities."
        ),
        eligibility_summary="Medical insurance for people 65+ or with qualifying disabilities.",
        program_type="medicare_part_b",
        apply_url="https://www.ssa.gov/medicare/sign-up",
        is_federal=True,
        is_supplemental=False,
        rules=[
            EligibilityRule(min_age=65),
            EligibilityRule(requires_disability=True),
        ],
        requirements=[
            Requirement(description="Proof of age (65+) or disability determination", display_order=1),
            Requirement(description="Social Security number", display_order=2),
        ],
    )

    msp = Benefit(
        program_key="msp",
        name="Medicare Savings Program",
        description=(
            "Medicare Savings Programs help people with limited income pay "
            "Medicare premiums, and in some cases deductibles, coinsurance, "
            "and copayments. Run by your state Medicaid office."
        ),
        eligibility_summary="Helps cover Medicare premiums, deductibles, and copays.",
        program_type="msp",
        apply_url="https://www.medicare.gov/basics/costs/help/medicare-savings-programs",
        is_federal=True,
        is_supplemental=True,
        rules=[
            EligibilityRule(max_income=21660, income_per_extra_person=7380, requires_coverage="medicare"),
        ],
        requirements=[
            Requirement(description="Medicare card or Medicare number", display_order=1),
            Requirement(description="Proof of income", display_order=2),
            Requirement(description="Bank statements (resource limits apply)", display_order=3),
        ],
    )

    extra_help = Benefit(
        program_key="extra_help",
        name="Extra Help",
        description=(
            "Extra Help (the Low-Income Subsidy) lowers what you pay for "
            "Medicare Part D prescription drug coverage, including premiums, "
            "deductibles, and the cost of each prescription."
        ),
        eligibility_summary="Assistance paying for prescription drug costs under Medicare Part D.",
        program_type="extra_help",
        apply_url="https://www.ssa.gov/medicare/part-d-extra-help",
        is_federal=True,
        is_supplemental=True,
        rules=[
            EligibilityRule(max_income=23475, income_per_extra_person=8190, requires_coverage="medicare"),
        ],
        requirements=[
            Requirement(description="Medicare number", display_order=1),
            Requirement(description="Proof of income and resources", display_order=2),
        ],
    )

    db.add_all([medicaid, part_b, msp, extra_help])
    db.commit()
    print(f"Seeded {db.query(Benefit).count()} benefits.")
    db.close()


if __name__ == "__main__":
    seed()
