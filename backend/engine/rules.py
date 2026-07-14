"""The eligibility engine.

Pure functions, no FastAPI imports, so this file is trivial to unit test.
A benefit matches if ANY of its eligibility_rules rows passes (OR logic).
Each check returns (matched: bool, reason: str) so the results page can
show a plain-language "why you may qualify" line.
"""
from typing import List, Optional, Tuple

from db.models import Benefit, EligibilityRule
from models.schemas import IntakeForm


def income_limit_for_household(rule: EligibilityRule, household_size: int) -> Optional[int]:
    """Scale the rule's income ceiling by household size when configured."""
    if rule.max_income is None:
        return None
    extra_people = max(household_size - 1, 0)
    per_person = rule.income_per_extra_person or 0
    return rule.max_income + extra_people * per_person


def immigration_passes(rule: EligibilityRule, intake: IntakeForm) -> Tuple[bool, str, str]:
    """Check the rule's immigration requirement against the intake.

    Returns (passed, reason, caveat). The caveat is non-empty when the user
    chose "prefer not to say" on a status-dependent program: we still show
    the program (hiding it could cost someone real help) but tell them
    eligibility depends on immigration status.
    """
    policy = rule.immigration_rule or "none"
    status = intake.immigration_status

    if policy == "none":
        return True, "", ""

    if status == "prefer_not":
        return True, "", (
            "This program has immigration status requirements, so check with "
            "the agency about your situation."
        )

    if policy == "lawfully_present":
        # Citizens, green card holders (no waiting period), refugees/asylees,
        # and visa holders can all use these programs.
        if status in ("citizen", "green_card", "refugee_asylee", "visa"):
            if status == "green_card":
                return True, "green card holders can enroll with no waiting period", ""
            if status == "refugee_asylee":
                return True, "refugees and asylees can enroll right away", ""
            return True, "", ""
        return False, "", ""

    if policy == "five_year_bar":
        if status == "citizen":
            return True, "", ""
        if status == "refugee_asylee":
            return True, "refugees and asylees are exempt from the 5-year waiting period", ""
        if status == "green_card":
            years = intake.years_in_us if intake.years_in_us is not None else 0
            if years >= 5:
                return True, f"you have had lawful status for {years} years (5 required)", ""
            return False, "", ""
        return False, "", ""  # visa holders

    return True, "", ""


def rule_passes(rule: EligibilityRule, intake: IntakeForm) -> Tuple[bool, str]:
    """Check one qualifying path. Returns (passed, reason)."""
    reasons = []

    if rule.min_age is not None:
        if intake.age < rule.min_age:
            return False, ""
        reasons.append(f"you are {intake.age} (minimum age {rule.min_age})")

    if rule.max_age is not None and intake.age > rule.max_age:
        return False, ""

    limit = income_limit_for_household(rule, intake.household_size)
    if limit is not None:
        if intake.income > limit:
            return False, ""
        reasons.append(
            f"your household income of ${intake.income:,} is within the "
            f"${limit:,} limit for a household of {intake.household_size}"
        )

    if rule.requires_disability:
        if not intake.disability_status:
            return False, ""
        reasons.append("you reported having a disability")

    if rule.requires_veteran:
        if not intake.veteran_status:
            return False, ""
        reasons.append("you are a veteran")

    if rule.requires_pregnant:
        if not intake.is_pregnant:
            return False, ""
        reasons.append("someone in your household is pregnant")

    if rule.requires_children_under_18:
        if not intake.has_children_under_18:
            return False, ""
        reasons.append("you have children under 18")

    if rule.requires_children_under_5:
        if not intake.has_children_under_5:
            return False, ""
        reasons.append("you have a child under 5")

    if rule.state is not None and rule.state.upper() != intake.state.upper():
        return False, ""

    if rule.requires_coverage is not None:
        coverage = [c.lower() for c in intake.current_coverage]
        if rule.requires_coverage.lower() not in coverage:
            return False, ""
        reasons.append(f"you already have {rule.requires_coverage.title()} coverage")

    imm_passed, imm_reason, imm_caveat = immigration_passes(rule, intake)
    if not imm_passed:
        return False, ""
    if imm_reason:
        reasons.append(imm_reason)

    reason = "Based on your answers, " + " and ".join(reasons) + "." if reasons else \
        "This program has no restrictions that exclude you."
    if imm_caveat:
        reason = (reason + " " + imm_caveat).strip()
    return True, reason


# Selecting a coverage type on the intake hides the programs it already
# represents. "medicare" hides Parts A and B (you have them) and the
# Marketplace, because selling a Marketplace plan to someone on Medicare
# is illegal, a fact scammers ignore.
COVERAGE_EXCLUDES = {
    "medicare": {"medicare_part_a", "medicare_part_b", "marketplace"},
    "medicaid": {"medicaid"},
    "marketplace": {"marketplace"},
}


def already_enrolled(benefit: Benefit, intake: IntakeForm) -> bool:
    """Skip programs the user says they already have (e.g. don't match
    Medicare Part A to someone who selected Medicare as current coverage)."""
    key = benefit.program_key.lower()
    for coverage in intake.current_coverage:
        c = coverage.lower()
        if key == c or key in COVERAGE_EXCLUDES.get(c, set()):
            return True
    return False


def match_benefits(benefits: List[Benefit], intake: IntakeForm) -> List[dict]:
    """Run the intake against every benefit's rules. Returns matched benefits
    with a matchReason, ready for the results page."""
    matches = []
    for benefit in benefits:
        if already_enrolled(benefit, intake):
            continue
        for rule in benefit.rules:
            passed, reason = rule_passes(rule, intake)
            if passed:
                matches.append(
                    {
                        "id": benefit.benefit_id,
                        "name": benefit.name,
                        "description": benefit.description,
                        "eligibility_summary": benefit.eligibility_summary,
                        "apply_url": benefit.apply_url,
                        "program_type": benefit.program_type,
                        "match_reason": reason,
                    }
                )
                break  # one passing rule is enough (OR logic)
    return matches
