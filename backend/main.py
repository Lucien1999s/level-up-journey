import json
import os
from enum import Enum
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, field_validator


BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env", override=False)


PATH_AND_DOMAIN_PROMPT_PLACEHOLDER = ""
BADGE_PROMPT_PLACEHOLDER = ""
LEVEL_AND_PROFICIENCY_PROMPT_PLACEHOLDER = ""


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


class PathCreationInput(BaseModel):
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


class DomainSeed(BaseModel):
    name: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)


class DomainPlanResult(BaseModel):
    domains: list[DomainSeed] = Field(..., min_length=1)


class PathAndDomainsResult(BaseModel):
    path: str = Field(..., min_length=1)
    domains: list[DomainSeed] = Field(..., min_length=1)


class BadgeProgress(BaseModel):
    name: str = Field(..., min_length=1)
    type: BadgeType
    progress: int = Field(..., ge=0, le=100)
    is_completed: bool
    reason: str = Field(..., min_length=1)


class BadgeResult(BaseModel):
    badges: list[BadgeProgress] = Field(..., min_length=1)


class DomainInitialization(BaseModel):
    name: str = Field(..., min_length=1)
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str = Field(..., min_length=1)


class PathProgress(BaseModel):
    name: str = Field(..., min_length=1)
    level: int = Field(..., ge=1, le=100)


class InitializationAssessment(BaseModel):
    path: PathProgress
    domains: list[DomainInitialization] = Field(..., min_length=1)


class PathInitializationResult(BaseModel):
    path: PathProgress
    domains: list[DomainInitialization]
    badges: list[BadgeProgress]


class WorkflowState(TypedDict, total=False):
    user_input: PathCreationInput
    path_and_domains: PathAndDomainsResult
    badges: BadgeResult
    assessment: InitializationAssessment
    result: PathInitializationResult


def get_llm() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is missing from the environment.")

    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        api_key=api_key,
        temperature=0.2,
    )


def build_messages(instruction: str, payload: dict) -> list:
    return [
        SystemMessage(content=instruction),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
    ]


def invoke_structured_output(
    llm: ChatGoogleGenerativeAI,
    schema: type[BaseModel],
    instruction: str,
    payload: dict,
) -> BaseModel:
    structured_llm = llm.with_structured_output(schema)
    return structured_llm.invoke(build_messages(instruction, payload))


def build_path_and_domains_instruction() -> str:
    return f"""
You initialize a new Level-Up Journey path.
Return only structured data for the requested schema.

Task:
- Propose a concise initial set of domains for this path.
- Keep domains practical and editable for an MVP product.
- Each domain must include a short summary.
- Use the user's given route name as the path name without renaming it.
- Write all user-facing text in the requested language from the `lang` field.

User prompt placeholder for future editing:
{PATH_AND_DOMAIN_PROMPT_PLACEHOLDER}
""".strip()


def build_badge_instruction() -> str:
    return f"""
You initialize badges for a new Level-Up Journey path.
Return only structured data for the requested schema.

Task:
- Generate both achievement and identity badges.
- Progress must be an integer from 0 to 100. Please evaluate carefully; if the user doesn't provide much detailed proof, the progress value will usually not be high. Do not set the progress value to full at the beginning.
- is_completed must be true only when progress is 100.
- Provide a short reason for each badge.
- Keep badges selective and high-signal.
- Prefer a small set of distinctive badges over many generic badges, each with a different aspect.
- Only create a badge when the user's background shows a meaningful identity, milestone, or strong signal.
- Avoid trivial, repetitive, beginner, or filler badges.
- Write all user-facing text in the requested language from the `lang` field.

User prompt placeholder for future editing:
{BADGE_PROMPT_PLACEHOLDER}
""".strip()


def build_level_and_proficiency_instruction() -> str:
    return f"""
You assess the initial level and domain proficiency for a new Level-Up Journey path.
Return only structured data for the requested schema, you should be slightly strict.

Task:
- Decide the initial path level (0-100). Strictly assign user levels based on user descriptions to avoid overestimating user levels.
   Reference: Beginner: 0-10, Experienced: 10-15, Proficient: 15-35, Expert: 35-60, Authority: 60-80, World-class: 80-90
- Assess each domain with one rating from:
  Initiate, Apprentice, Practitioner, Specialist, Expert, Master
- Add one concise reason for each domain rating be harsh and realistic.
- Base the judgment on the user's current status and past achievements.
- Write all user-facing text in the requested language from the `lang` field.

User prompt placeholder for future editing:
{LEVEL_AND_PROFICIENCY_PROMPT_PLACEHOLDER}
""".strip()


def build_workflow(llm: ChatGoogleGenerativeAI):
    def build_path_and_domains_node(state: WorkflowState) -> WorkflowState:
        user_input = state["user_input"]
        domain_plan = invoke_structured_output(
            llm=llm,
            schema=DomainPlanResult,
            instruction=build_path_and_domains_instruction(),
            payload=user_input.model_dump(),
        )
        return {
            "path_and_domains": PathAndDomainsResult(
                path=user_input.route_name,
                domains=domain_plan.domains,
            )
        }

    def build_badges_node(state: WorkflowState) -> WorkflowState:
        user_input = state["user_input"]
        result = invoke_structured_output(
            llm=llm,
            schema=BadgeResult,
            instruction=build_badge_instruction(),
            payload=user_input.model_dump(),
        )

        normalized_badges = [
            badge.model_copy(
                update={"is_completed": badge.progress == 100}
            )
            for badge in result.badges
        ]
        return {"badges": BadgeResult(badges=normalized_badges)}

    def build_level_and_domain_proficiency_node(
        state: WorkflowState,
    ) -> WorkflowState:
        user_input = state["user_input"]
        path_and_domains = state["path_and_domains"]

        assessment = invoke_structured_output(
            llm=llm,
            schema=InitializationAssessment,
            instruction=build_level_and_proficiency_instruction(),
            payload={
                "user_input": user_input.model_dump(),
                "path_and_domains": path_and_domains.model_dump(),
            },
        )

        result = PathInitializationResult(
            path=PathProgress(
                name=path_and_domains.path,
                level=assessment.path.level,
            ),
            domains=assessment.domains,
            badges=state["badges"].badges,
        )
        return {"assessment": assessment, "result": result}

    graph = StateGraph(WorkflowState)
    graph.add_node("build_path_and_domains", build_path_and_domains_node)
    graph.add_node("build_badges", build_badges_node)
    graph.add_node(
        "build_level_and_domain_proficiency",
        build_level_and_domain_proficiency_node,
    )
    graph.add_edge(START, "build_path_and_domains")
    graph.add_edge(START, "build_badges")
    graph.add_edge(
        ["build_path_and_domains", "build_badges"],
        "build_level_and_domain_proficiency",
    )
    graph.add_edge("build_level_and_domain_proficiency", END)
    return graph.compile()


def initialize_path(user_input: PathCreationInput) -> PathInitializationResult:
    llm = get_llm()
    workflow = build_workflow(llm)
    state = workflow.invoke({"user_input": user_input})
    return state["result"]


if __name__ == "__main__":
    example_input = PathCreationInput(
        route_name="AI Inference",
        current_status="我目前正在學習vllm 會基礎知識而已",
        past_achievements="剛加入picomp-lab 美國研究所碩士負責相關研究",
        lang="en",
    )

    result = initialize_path(example_input)
    print(json.dumps(result.model_dump(), indent=2, ensure_ascii=False))
