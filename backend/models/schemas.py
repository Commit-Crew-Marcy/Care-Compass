"""Pydantic schemas. Incoming/outgoing JSON is camelCase; Python is snake_case.

Pydantic handles the mapping via alias generators, which is what the
"the FastAPI layer maps between them" line in the spec refers to.
"""
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# The five answers a user can give on the immigration step. "prefer_not"
# still returns every program without a status requirement, plus status-
# dependent programs flagged with a "check with the agency" caveat.
ImmigrationStatus = Literal["citizen", "green_card", "refugee_asylee", "visa", "prefer_not"]
HelpCategory = Literal["all", "health", "food", "housing", "money", "family", "work_education"]


class CamelModel(BaseModel):
    """Base model: accepts and emits camelCase, stores snake_case internally."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class IntakeForm(CamelModel):
    """Body of POST /api/eligibility/check. Matches the 7-step questionnaire."""

    # The person completing the questionnaire must be an adult (18+). This
    # does not limit which programs they can be matched to for their
    # household — child-focused programs (CHIP, WIC, Head Start, school
    # meals) key off hasChildrenUnder18/hasChildrenUnder5, not this field.
    age: int = Field(..., ge=18, le=120)
    income: int = Field(..., ge=0, le=10_000_000)
    state: str = Field(..., min_length=2, max_length=2)
    # NYC Open Data contains NYC-only resources. This explicit answer keeps
    # those programs from being shown to every New York State resident.
    nyc_resident: Optional[bool] = None
    # Maps to the dataset's program_category field. Empty remains accepted for
    # backward compatibility and means "all categories".
    help_categories: List[HelpCategory] = Field(default_factory=list, max_length=7)
    household_size: int = Field(default=1, ge=1)
    disability_status: bool = False
    # Descriptive-only fields — accepted and stored but never read by rules.py
    disability_details: List[str] = Field(default_factory=list)
    disability_other_text: Optional[str] = None
    veteran_status: bool = False
    is_pregnant: bool = False
    has_children_under_18: bool = False
    has_children_under_5: bool = False
    immigration_status: ImmigrationStatus = "prefer_not"
    years_in_us: Optional[int] = Field(default=None, ge=0, le=130)
    insurance_status: bool = False
    current_coverage: List[str] = Field(default_factory=list)


class RequirementOut(CamelModel):
    description: str
    display_order: int


class BenefitCard(CamelModel):
    """Shape of a benefit in list responses (results page cards)."""

    id: Union[int, str]
    name: str
    description: str
    eligibility_summary: str
    apply_url: Optional[str] = None
    program_type: str
    source: Literal["carecompass", "nyc_open_data"] = "carecompass"
    external_id: Optional[str] = None
    eligibility_details: str = ""
    application_summary: str = ""
    government_agency: str = ""
    source_updated_at: Optional[str] = None


class BenefitOut(BenefitCard):
    """Full benefit for GET /api/benefits and /api/benefits/:id."""

    federal: bool


class BenefitDetail(BenefitOut):
    requirements: List[RequirementOut] = Field(default_factory=list)


class MatchedBenefit(BenefitCard):
    """A matched program plus the plain-language reason it matched."""

    match_reason: str


class PageControl(CamelModel):
    """One approved, currently-visible control or heading the assistant may reference."""

    id: str
    type: str
    label: str


class PageLink(CamelModel):
    """One approved, currently-visible internal link the assistant may reference or navigate to."""

    id: str
    label: str
    route: str


class MatchedBenefitSummary(CamelModel):
    name: str
    description: str = ""


class BenefitDetailSummary(CamelModel):
    name: str
    description: str = ""


ResponseMode = Literal["simple", "more_detail"]


class PageContext(CamelModel):
    """Safe semantic summary of the page the user is looking at.

    Built entirely on the frontend from approved fields only — never raw HTML,
    scripts, hidden fields, or sensitive free text. See ai.py's PAGE CONTEXT
    handling: this whole object is treated as untrusted reference material,
    not instructions.
    """

    route: str = ""
    page_title: str = ""
    heading: str = ""
    section_headings: List[str] = Field(default_factory=list)
    questionnaire_step: Optional[int] = None
    visible_controls: List[PageControl] = Field(default_factory=list)
    visible_links: List[PageLink] = Field(default_factory=list)
    validation_messages: List[str] = Field(default_factory=list)
    matched_benefits: List[MatchedBenefitSummary] = Field(default_factory=list)
    benefit_detail: Optional[BenefitDetailSummary] = None


class ChatHistoryTurn(CamelModel):
    role: Literal["user", "assistant"]
    text: str


ActionType = Literal[
    "navigate_to_route",
    "scroll_to_element",
    "focus_element",
    "go_back",
    "open_chat",
    "close_chat",
]


class ChatAction(CamelModel):
    type: ActionType
    target: Optional[str] = None
    requires_confirmation: bool = False


class ChatRequest(CamelModel):
    question: str = Field(..., min_length=1, max_length=2000)
    page_context: Optional[PageContext] = None
    response_mode: ResponseMode = "simple"
    # Short recent-turn history so follow-ups like "read this more simply" make
    # sense. Only role/text — never persisted server-side beyond this request.
    history: List[ChatHistoryTurn] = Field(default_factory=list)


class ChatResponse(CamelModel):
    message: str
    action: Optional[ChatAction] = None


ExtensionElementAction = Literal["scroll", "focus", "click"]
ExtensionActionType = Literal[
    "scroll_to_element",
    "focus_element",
    "click_element",
    "go_back",
]


class ExtensionInteractiveElement(CamelModel):
    """A visible page control captured by the browser extension.

    The extension creates opaque, short-lived ids and decides which actions
    each element supports. Input values are never included.
    """

    id: str = Field(..., min_length=1, max_length=80)
    role: str = Field(default="control", max_length=40)
    label: str = Field(..., min_length=1, max_length=240)
    tag: str = Field(default="", max_length=30)
    input_type: str = Field(default="", max_length=30)
    in_form: bool = False
    href: Optional[str] = Field(default=None, max_length=2048)
    allowed_actions: List[ExtensionElementAction] = Field(default_factory=list, max_length=3)


class ExtensionPageContext(CamelModel):
    """Filtered visible-page context supplied by the Chrome extension."""

    url: str = Field(..., min_length=8, max_length=2048)
    domain: str = Field(default="", max_length=255)
    page_title: str = Field(default="", max_length=300)
    heading: str = Field(default="", max_length=300)
    section_headings: List[str] = Field(default_factory=list, max_length=24)
    page_text: str = Field(default="", max_length=12_000)
    selected_text: str = Field(default="", max_length=2_000)
    interactive_elements: List[ExtensionInteractiveElement] = Field(default_factory=list, max_length=60)


class ExtensionChatAction(CamelModel):
    type: ExtensionActionType
    target: Optional[str] = None
    requires_confirmation: bool = False


class ExtensionChatRequest(CamelModel):
    question: str = Field(..., min_length=1, max_length=2000)
    page_context: ExtensionPageContext
    response_mode: ResponseMode = "simple"
    history: List[ChatHistoryTurn] = Field(default_factory=list, max_length=6)


class ExtensionChatResponse(CamelModel):
    message: str
    action: Optional[ExtensionChatAction] = None


class Message(CamelModel):
    message: str


# ---------- Auth ----------

class RegisterRequest(CamelModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: Optional[str] = None


class LoginRequest(CamelModel):
    email: str
    password: str


class UserOut(CamelModel):
    id: int
    email: str
    display_name: Optional[str] = None


class AuthResponse(CamelModel):
    token: str
    user: UserOut


# ---------- Screenings (CRUD resource) ----------

class ScreeningCreate(CamelModel):
    name: str = Field(default="My screening", max_length=100)
    age: int = Field(..., ge=0, le=130)
    income: int = Field(..., ge=0)
    state: str = Field(..., min_length=2, max_length=2)
    household_size: int = Field(default=1, ge=1)
    disability_status: bool = False
    disability_details: List[str] = Field(default_factory=list)
    disability_other_text: Optional[str] = None
    veteran_status: bool = False
    is_pregnant: bool = False
    has_children_under_18: bool = False
    has_children_under_5: bool = False
    immigration_status: ImmigrationStatus = "prefer_not"
    years_in_us: Optional[int] = Field(default=None, ge=0, le=130)
    insurance_status: bool = False
    current_coverage: List[str] = Field(default_factory=list)
    matched_benefits: List[dict] = Field(default_factory=list)


class ScreeningUpdate(CamelModel):
    """All fields optional — send only what you want to change."""

    name: Optional[str] = Field(default=None, max_length=100)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    income: Optional[int] = Field(default=None, ge=0)
    state: Optional[str] = Field(default=None, min_length=2, max_length=2)
    household_size: Optional[int] = Field(default=None, ge=1)
    disability_status: Optional[bool] = None
    disability_details: Optional[List[str]] = None
    disability_other_text: Optional[str] = None
    veteran_status: Optional[bool] = None
    is_pregnant: Optional[bool] = None
    has_children_under_18: Optional[bool] = None
    has_children_under_5: Optional[bool] = None
    immigration_status: Optional[ImmigrationStatus] = None
    years_in_us: Optional[int] = Field(default=None, ge=0, le=130)
    insurance_status: Optional[bool] = None
    current_coverage: Optional[List[str]] = None


class ScreeningOut(CamelModel):
    id: int
    name: str
    age: int
    income: int
    state: str
    household_size: int
    disability_status: bool
    disability_details: List[str] = Field(default_factory=list)
    disability_other_text: Optional[str] = None
    veteran_status: bool
    is_pregnant: bool
    has_children_under_18: bool
    has_children_under_5: bool
    immigration_status: str
    years_in_us: Optional[int] = None
    insurance_status: bool
    current_coverage: List[str]
    matched_benefits: List[dict]
