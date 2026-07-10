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

    if rule.state is not None and rule.state.upper() != intake.state.upper():
        return False, ""

    if rule.requires_coverage is not None:
        coverage = [c.lower() for c in intake.current_coverage]
        if rule.requires_coverage.lower() not in coverage:
            return False, ""
        reasons.append(f"you already have {rule.requires_coverage.title()} coverage")

    reason = "Based on your answers, " + " and ".join(reasons) + "." if reasons else \
        "This program has no restrictions that exclude you."
    return True, reason


def already_enrolled(benefit: Benefit, intake: IntakeForm) -> bool:
    """Skip programs the user says they already have (e.g. don't match
    Medicaid to someone who selected Medicaid as current coverage)."""
    coverage = [c.lower() for c in intake.current_coverage]
    return benefit.program_key.lower() in coverage


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
