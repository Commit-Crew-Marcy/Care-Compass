"""Seed the database with 18 benefit programs covering all ages,
families, and people new to the United States.

Run once:  python -m db.seed
(main.py also auto-seeds on startup, and re-seeds whenever this program
list changes, so deployed databases update themselves.)

Income limits are approximations of 2025 federal poverty guidelines
(FPL: $15,650 for one person + $5,500 per extra person) so the demo
behaves realistically. Verify current numbers before the final demo,
they change every year. TANF and CHIP vary a lot by state; the numbers
here are mid-range approximations, which the descriptions say plainly.

Immigration rules used below:
  "none"             open to everyone regardless of status
  "lawfully_present" citizens, green card holders (no wait), refugees/asylees, visa holders
  "five_year_bar"    citizens and refugees/asylees immediately; green card holders after 5 years
"""
from db.database import Base, SessionLocal, engine
from db.models import Benefit, EligibilityRule, Requirement

Base.metadata.create_all(bind=engine)


def build_benefits():
    """Return the full program list as unsaved ORM objects."""

    # ---------------- Medicare (65+ or disability) ----------------

    part_a = Benefit(
        program_key="medicare_part_a",
        name="Medicare Part A (Hospital Insurance)",
        description=(
            "Part A covers hospital stays, skilled nursing facility care, hospice "
            "care, and some home health care. Most people pay no monthly premium "
            "for Part A if they or their spouse paid Medicare taxes for about 10 "
            "years while working. Your first chance to enroll is the 7-month "
            "window around your 65th birthday (3 months before your birthday "
            "month, your birthday month, and 3 months after)."
        ),
        eligibility_summary="Hospital insurance for people 65+ or with qualifying disabilities. Usually premium-free.",
        program_type="medicare_part_a",
        apply_url="https://www.ssa.gov/medicare/sign-up",
        is_federal=True,
        rules=[
            EligibilityRule(min_age=65, immigration_rule="five_year_bar"),
            EligibilityRule(requires_disability=True, immigration_rule="five_year_bar"),
        ],
        requirements=[
            Requirement(description="Proof of age (65+) or disability determination", display_order=1),
            Requirement(description="Social Security number", display_order=2),
            Requirement(description="Proof of citizenship or lawful residence", display_order=3),
        ],
    )

    part_b = Benefit(
        program_key="medicare_part_b",
        name="Medicare Part B (Medical Insurance)",
        description=(
            "Part B covers doctor visits, outpatient care, preventive services "
            "like screenings and vaccines, and medical equipment. Most people pay "
            "a standard monthly premium that is set each year and is often taken "
            "out of Social Security checks. Sign up during the 7-month window "
            "around your 65th birthday to avoid a late enrollment penalty that "
            "lasts for life."
        ),
        eligibility_summary="Medical insurance for people 65+ or with qualifying disabilities.",
        program_type="medicare_part_b",
        apply_url="https://www.ssa.gov/medicare/sign-up",
        is_federal=True,
        rules=[
            EligibilityRule(min_age=65, immigration_rule="five_year_bar"),
            EligibilityRule(requires_disability=True, immigration_rule="five_year_bar"),
        ],
        requirements=[
            Requirement(description="Proof of age (65+) or disability determination", display_order=1),
            Requirement(description="Social Security number", display_order=2),
        ],
    )

    advantage = Benefit(
        program_key="medicare_advantage",
        name="Medicare Advantage (Part C)",
        description=(
            "Medicare Advantage is an alternative way to get your Part A and "
            "Part B coverage through a private insurance company. Most plans "
            "bundle in prescription drugs (Part D) and extras like dental, "
            "vision, and hearing, but you usually must use doctors in the "
            "plan's network. Important: because private companies sell these "
            "plans, turning 65 brings a flood of mail and sales calls. Only "
            "trust plan comparisons from medicare.gov or 1-800-MEDICARE, and "
            "know that you cannot have both Medicare Advantage and a Medigap "
            "plan at the same time."
        ),
        eligibility_summary="Private all-in-one alternative to Original Medicare, often with drug, dental, and vision coverage.",
        program_type="medicare_advantage",
        apply_url="https://www.medicare.gov/health-drug-plans/health-plans",
        is_federal=True,
        is_supplemental=True,
        rules=[EligibilityRule(requires_coverage="medicare")],
        requirements=[
            Requirement(description="Medicare card (you must have Parts A and B)", display_order=1),
            Requirement(description="List of your doctors and medicines to check the plan's network", display_order=2),
        ],
    )

    part_d = Benefit(
        program_key="medicare_part_d",
        name="Medicare Part D (Prescription Drugs)",
        description=(
            "Part D adds prescription drug coverage to Original Medicare through "
            "a private plan with its own monthly premium. If you go without drug "
            "coverage after becoming eligible, a late enrollment penalty gets "
            "added to your premium permanently, so it is worth enrolling even if "
            "you take few medicines today. Compare plans on medicare.gov because "
            "each plan covers a different list of drugs."
        ),
        eligibility_summary="Prescription drug coverage that works alongside Original Medicare.",
        program_type="medicare_part_d",
        apply_url="https://www.medicare.gov/health-drug-plans/part-d",
        is_federal=True,
        is_supplemental=True,
        rules=[EligibilityRule(requires_coverage="medicare")],
        requirements=[
            Requirement(description="Medicare number", display_order=1),
            Requirement(description="List of your current prescriptions", display_order=2),
        ],
    )

    medigap = Benefit(
        program_key="medigap",
        name="Medigap (Medicare Supplement)",
        description=(
            "Medigap plans cover the out-of-pocket costs Original Medicare "
            "leaves behind, like deductibles, copayments, and coinsurance. Plans "
            "are standardized by letter (Plan G, Plan N, and so on), so the same "
            "letter has the same core benefits from every company; only the "
            "price and perks differ. The best time to buy is your 6-month "
            "Medigap Open Enrollment Period, which starts the month you turn 65 "
            "and have Part B. During that window companies cannot reject you or "
            "charge more for health conditions. This is also when sales mail "
            "floods in, so compare plans only through medicare.gov or your "
            "state's free SHIP counselors."
        ),
        eligibility_summary="Covers the deductibles and copays Original Medicare does not pay.",
        program_type="medigap",
        apply_url="https://www.medicare.gov/health-drug-plans/medigap",
        is_federal=True,
        is_supplemental=True,
        rules=[EligibilityRule(requires_coverage="medicare")],
        requirements=[
            Requirement(description="Medicare Part B enrollment", display_order=1),
            Requirement(description="Your Medigap Open Enrollment window (6 months from Part B start at 65+)", display_order=2),
        ],
    )

    extra_help = Benefit(
        program_key="extra_help",
        name="Extra Help (Low-Income Subsidy)",
        description=(
            "Extra Help lowers what you pay for Medicare Part D prescription "
            "coverage, including premiums, deductibles, and the price of each "
            "prescription. Many people who qualify never apply because they do "
            "not know it exists. It is run by Social Security and applying is "
            "free."
        ),
        eligibility_summary="Cuts prescription drug costs for Medicare members with limited income.",
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

    msp = Benefit(
        program_key="msp",
        name="Medicare Savings Program",
        description=(
            "Medicare Savings Programs pay some or all of your Medicare "
            "premiums, and in some cases deductibles, coinsurance, and "
            "copayments. Your state Medicaid office runs the program. If you "
            "qualify, you are also automatically enrolled in Extra Help for "
            "prescriptions."
        ),
        eligibility_summary="Your state helps pay Medicare premiums, deductibles, and copays.",
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

    # ---------------- Health coverage for all ages ----------------

    medicaid = Benefit(
        program_key="medicaid",
        name="Medicaid",
        description=(
            "Medicaid provides free or very low-cost health coverage to people "
            "with limited income: adults, children, pregnant women, older "
            "adults, and people with disabilities. It covers doctor visits, "
            "hospital care, prescriptions, and more. Most green card holders "
            "must wait 5 years before qualifying, but refugees and asylees can "
            "enroll right away, and pregnant women and children are covered "
            "sooner in many states."
        ),
        eligibility_summary="Free or low-cost health coverage for people with limited income.",
        program_type="medicaid",
        apply_url="https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip/index.html",
        is_federal=True,
        rules=[
            # Income path (roughly 138% FPL)
            EligibilityRule(max_income=21597, income_per_extra_person=7590, immigration_rule="five_year_bar"),
            # Disability path with a higher allowance
            EligibilityRule(requires_disability=True, max_income=32000, income_per_extra_person=7590, immigration_rule="five_year_bar"),
            # Pregnancy path (roughly 200% FPL in many states)
            EligibilityRule(requires_pregnant=True, max_income=31300, income_per_extra_person=11000, immigration_rule="five_year_bar"),
        ],
        requirements=[
            Requirement(description="Proof of identity (driver's license or state ID)", display_order=1),
            Requirement(description="Proof of income (pay stubs, tax return, or benefits letter)", display_order=2),
            Requirement(description="Proof of state residency", display_order=3),
            Requirement(description="Immigration documents if you are not a citizen", display_order=4),
        ],
    )

    emergency_medicaid = Benefit(
        program_key="emergency_medicaid",
        name="Emergency Medicaid",
        description=(
            "Emergency Medicaid pays for emergency medical care, including "
            "emergency labor and delivery, for people who meet the income rules "
            "but do not qualify for full Medicaid because of their immigration "
            "status. It applies regardless of status. If you have a medical "
            "emergency, hospitals must treat you first; the hospital's financial "
            "counselors can help you apply afterward."
        ),
        eligibility_summary="Covers emergency care for people with limited income, regardless of immigration status.",
        program_type="emergency_medicaid",
        apply_url="https://www.medicaid.gov/about-us/where-can-people-get-help-medicaid-chip/index.html",
        is_federal=True,
        rules=[
            EligibilityRule(max_income=21597, income_per_extra_person=7590, immigration_rule="none"),
        ],
        requirements=[
            Requirement(description="Proof of income", display_order=1),
            Requirement(description="Proof of state residency", display_order=2),
            Requirement(description="Records from the emergency visit (the hospital can help)", display_order=3),
        ],
    )

    chip = Benefit(
        program_key="chip",
        name="CHIP (Children's Health Insurance)",
        description=(
            "CHIP gives free or low-cost health coverage to children under 19 "
            "in families that earn too much for Medicaid but cannot afford "
            "private insurance. It covers checkups, dental, vision, "
            "prescriptions, and hospital care. Children can often qualify "
            "regardless of their parents' immigration status, and applying for "
            "CHIP does not affect a parent's immigration case."
        ),
        eligibility_summary="Free or low-cost health coverage for children under 19.",
        program_type="chip",
        apply_url="https://www.insurekidsnow.gov/",
        is_federal=True,
        rules=[
            EligibilityRule(requires_children_under_18=True, max_income=39908, income_per_extra_person=14025, immigration_rule="none"),
        ],
        requirements=[
            Requirement(description="Children's birth certificates or IDs", display_order=1),
            Requirement(description="Proof of household income", display_order=2),
            Requirement(description="Proof of state residency", display_order=3),
        ],
    )

    marketplace = Benefit(
        program_key="marketplace",
        name="Health Insurance Marketplace (ACA)",
        description=(
            "The Marketplace at HealthCare.gov is where you buy private health "
            "insurance, usually with a tax credit that lowers your monthly "
            "premium based on income. This matters especially for newcomers: "
            "green card holders and other lawfully present immigrants can use "
            "the Marketplace immediately, with no 5-year wait, and those still "
            "in the Medicaid waiting period can get subsidized Marketplace "
            "coverage instead. Open enrollment runs each fall, but moving to "
            "the US or losing coverage opens a special enrollment window."
        ),
        eligibility_summary="Subsidized private health insurance. No waiting period for lawfully present immigrants.",
        program_type="marketplace",
        apply_url="https://www.healthcare.gov/",
        is_federal=True,
        rules=[
            EligibilityRule(max_income=62600, income_per_extra_person=22000, immigration_rule="lawfully_present"),
        ],
        requirements=[
            Requirement(description="Estimated household income for this year", display_order=1),
            Requirement(description="Immigration documents if you are not a citizen", display_order=2),
            Requirement(description="Social Security numbers for applicants who have them", display_order=3),
        ],
    )

    # ---------------- Food, family, and money ----------------

    snap = Benefit(
        program_key="snap",
        name="SNAP (Food Assistance)",
        description=(
            "SNAP, often called food stamps, puts money on an EBT card each "
            "month to buy groceries. Most green card holders must wait 5 years, "
            "but refugees, asylees, and children of eligible immigrants can get "
            "SNAP sooner. Using SNAP for your eligible family members does not "
            "hurt your immigration case under current public charge rules."
        ),
        eligibility_summary="Monthly money for groceries on an EBT card.",
        program_type="snap",
        apply_url="https://www.fns.usda.gov/snap/state-directory",
        is_federal=True,
        rules=[
            EligibilityRule(max_income=20345, income_per_extra_person=7150, immigration_rule="five_year_bar"),
        ],
        requirements=[
            Requirement(description="Proof of identity", display_order=1),
            Requirement(description="Proof of income and expenses (rent, utilities)", display_order=2),
            Requirement(description="Immigration documents for non-citizen household members", display_order=3),
        ],
    )

    wic = Benefit(
        program_key="wic",
        name="WIC (Women, Infants, and Children)",
        description=(
            "WIC provides healthy food, baby formula, breastfeeding support, "
            "and nutrition help for pregnant women, new mothers, babies, and "
            "children under 5. WIC is open to everyone who meets the income "
            "rules regardless of immigration status, and using WIC never "
            "affects an immigration case."
        ),
        eligibility_summary="Food and support for pregnant women and children under 5, open regardless of immigration status.",
        program_type="wic",
        apply_url="https://www.fns.usda.gov/wic",
        is_federal=True,
        rules=[
            EligibilityRule(requires_pregnant=True, max_income=28953, income_per_extra_person=10175, immigration_rule="none"),
            EligibilityRule(requires_children_under_5=True, max_income=28953, income_per_extra_person=10175, immigration_rule="none"),
        ],
        requirements=[
            Requirement(description="Proof of identity for you and your child", display_order=1),
            Requirement(description="Proof of income", display_order=2),
            Requirement(description="Proof of address", display_order=3),
        ],
    )

    tanf = Benefit(
        program_key="tanf",
        name="TANF (Cash Assistance)",
        description=(
            "TANF gives monthly cash assistance to very low-income families "
            "with children, plus help with job training and child care. Each "
            "state runs its own program with its own name and income limits, "
            "so the amounts vary a lot by state. Most green card holders must "
            "wait 5 years; refugees and asylees qualify sooner."
        ),
        eligibility_summary="Monthly cash help for very low-income families with children.",
        program_type="tanf",
        apply_url="https://www.acf.hhs.gov/ofa/map/about/help-families",
        is_federal=True,
        rules=[
            EligibilityRule(requires_children_under_18=True, max_income=12000, income_per_extra_person=4200, immigration_rule="five_year_bar"),
        ],
        requirements=[
            Requirement(description="Children's birth certificates", display_order=1),
            Requirement(description="Proof of income and expenses", display_order=2),
            Requirement(description="Proof of state residency", display_order=3),
        ],
    )

    ssi = Benefit(
        program_key="ssi",
        name="SSI (Supplemental Security Income)",
        description=(
            "SSI pays a monthly check to people 65 and older, blind, or "
            "disabled who have very little income and few resources. It is run "
            "by Social Security and is separate from Social Security "
            "retirement. Immigration rules for SSI are the strictest of any "
            "program: most non-citizens do not qualify, though refugees and "
            "asylees can receive it during their first years in the US."
        ),
        eligibility_summary="Monthly payments for people 65+, blind, or disabled with very low income.",
        program_type="ssi",
        apply_url="https://www.ssa.gov/ssi",
        is_federal=True,
        rules=[
            EligibilityRule(min_age=65, max_income=11604, income_per_extra_person=5808, immigration_rule="five_year_bar"),
            EligibilityRule(requires_disability=True, max_income=11604, income_per_extra_person=5808, immigration_rule="five_year_bar"),
        ],
        requirements=[
            Requirement(description="Social Security number", display_order=1),
            Requirement(description="Proof of income, resources, and living situation", display_order=2),
            Requirement(description="Medical records if applying based on disability", display_order=3),
        ],
    )

    liheap = Benefit(
        program_key="liheap",
        name="LIHEAP (Utility Bill Help)",
        description=(
            "LIHEAP helps low-income households pay heating and cooling bills, "
            "and can help in an energy emergency like a shutoff notice. Every "
            "state runs a program. Apply early in the season because funds run "
            "out."
        ),
        eligibility_summary="Help paying heating and cooling bills.",
        program_type="liheap",
        apply_url="https://www.acf.hhs.gov/ocs/programs/liheap",
        is_federal=True,
        rules=[
            EligibilityRule(max_income=23475, income_per_extra_person=8250, immigration_rule="none"),
        ],
        requirements=[
            Requirement(description="Recent utility bills", display_order=1),
            Requirement(description="Proof of income", display_order=2),
        ],
    )

    school_lunch = Benefit(
        program_key="school_lunch",
        name="Free or Reduced-Price School Meals",
        description=(
            "Children in low-income families can get free or reduced-price "
            "breakfast and lunch at school. Apply through your child's school "
            "at any time of year. Immigration status is never asked on the "
            "application, and families already on SNAP usually qualify "
            "automatically."
        ),
        eligibility_summary="Free or low-cost school breakfast and lunch for children.",
        program_type="school_lunch",
        apply_url="https://www.fns.usda.gov/nslp",
        is_federal=True,
        rules=[
            EligibilityRule(requires_children_under_18=True, max_income=28953, income_per_extra_person=10175, immigration_rule="none"),
        ],
        requirements=[
            Requirement(description="School meal application (from the school office or website)", display_order=1),
            Requirement(description="Household income information", display_order=2),
        ],
    )

    head_start = Benefit(
        program_key="head_start",
        name="Head Start (Free Preschool)",
        description=(
            "Head Start and Early Head Start provide free preschool, child "
            "development, meals, and family support for children under 5 in "
            "low-income families. Programs exist in every state and enrollment "
            "is open to all children who qualify, regardless of immigration "
            "status."
        ),
        eligibility_summary="Free preschool and family support for children under 5.",
        program_type="head_start",
        apply_url="https://headstart.gov/",
        is_federal=True,
        rules=[
            EligibilityRule(requires_children_under_5=True, max_income=15650, income_per_extra_person=5500, immigration_rule="none"),
        ],
        requirements=[
            Requirement(description="Child's birth certificate", display_order=1),
            Requirement(description="Proof of income", display_order=2),
            Requirement(description="Proof of address", display_order=3),
        ],
    )

    return [
        part_a, part_b, advantage, part_d, medigap, extra_help, msp,
        medicaid, emergency_medicaid, chip, marketplace,
        snap, wic, tanf, ssi, liheap, school_lunch, head_start,
    ]


def seed():
    db = SessionLocal()
    new_benefits = build_benefits()
    expected_keys = {b.program_key for b in new_benefits}
    existing_keys = {key for (key,) in db.query(Benefit.program_key).all()}

    if existing_keys == expected_keys:
        print(f"Database already seeded with {len(existing_keys)} programs, skipping.")
        db.close()
        return

    if existing_keys:
        # Program list changed (for example, the 4-program MVP grew to 18):
        # wipe the catalog and reseed. Rules and requirements cascade-delete.
        print(f"Program list changed ({len(existing_keys)} -> {len(expected_keys)}), reseeding catalog.")
        db.query(Benefit).delete()
        db.commit()

    db.add_all(new_benefits)
    db.commit()
    print(f"Seeded {db.query(Benefit).count()} benefits.")
    db.close()


if __name__ == "__main__":
    seed()
