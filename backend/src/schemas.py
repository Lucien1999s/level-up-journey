from enum import Enum

from pydantic import BaseModel, Field, field_validator


class DomainProficiencyRating(str, Enum):
    INITIATE = "Initiate"
    APPRENTICE = "Apprentice"
    PRACTITIONER = "Practitioner"
    SPECIALIST = "Specialist"
    EXPERT = "Expert"
    MASTER = "Master"


class BadgeType(str, Enum):
    ACHIEVEMENT = "achievement"
    IDENTITY = "identity"


class InitializePathRequest(BaseModel):
    route_name: str = Field(..., min_length=1)
    current_status: str = Field(..., min_length=1)
    past_achievements: str = Field(..., min_length=1)
    lang: str = Field(default="en", min_length=2)

    @field_validator("route_name", "current_status", "past_achievements", "lang")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("All input fields must be non-empty strings.")
        return cleaned


class PathProgressResponse(BaseModel):
    id: int
    name: str
    level: int
    total_exp: int
    xp_to_next_level: int
    current_status: str
    past_achievements: str
    lang: str


class DomainResponse(BaseModel):
    id: int
    name: str
    summary: str
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str


class BadgeResponse(BaseModel):
    id: int
    name: str
    type: BadgeType
    progress: int
    is_completed: bool
    reason: str


class PathDetailResponse(BaseModel):
    path: PathProgressResponse
    domains: list[DomainResponse]
    badges: list[BadgeResponse]


class JourneyDataResponse(BaseModel):
    paths: list[PathDetailResponse]


class ActionLogRequest(BaseModel):
    action_log: str = Field(..., min_length=1)
    lang: str = Field(default="en", min_length=2)

    @field_validator("action_log", "lang")
    @classmethod
    def validate_action_log(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("action_log and lang must be non-empty strings.")
        return cleaned


class MatchedActionGroupResponse(BaseModel):
    path_id: int
    path_name: str
    matched_domains: list[str]
    evidence: str


class DomainActionUpdateResponse(BaseModel):
    domain_id: int | None = None
    name: str
    is_new: bool
    action_summary: str
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str


class PathActionUpdateResponse(BaseModel):
    path_id: int
    path_name: str
    previous_level: int
    new_level: int
    exp_gain: int
    new_total_exp: int
    evidence: str
    feedback: str
    domain_updates: list[DomainActionUpdateResponse]


class BadgeActionUpdateResponse(BaseModel):
    path_id: int
    badge_id: int
    badge_name: str
    previous_progress: int
    new_progress: int
    is_completed: bool
    reason: str


class ActionLogResponse(BaseModel):
    action_log: str
    matched_action_groups: list[MatchedActionGroupResponse]
    path_updates: list[PathActionUpdateResponse]
    badge_updates: list[BadgeActionUpdateResponse]


class PathProgressUpdateRequest(BaseModel):
    total_exp: int = Field(..., ge=0)


class BadgeCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    type: BadgeType
    progress: int = Field(default=0, ge=0, le=100)
    reason: str = Field(..., min_length=1)


class BadgeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    type: BadgeType | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    reason: str | None = Field(default=None, min_length=1)


class DomainCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    summary: str = Field(default="")
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str = Field(..., min_length=1)


class DomainUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    summary: str | None = None
    proficiency_rating: DomainProficiencyRating | None = None
    proficiency_reason: str | None = Field(default=None, min_length=1)

