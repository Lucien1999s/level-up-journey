from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from src.leveling import get_max_level
from src.llm import get_llm, invoke_structured_output
from src.schemas import BadgeType, DomainProficiencyRating, InitializePathRequest


class DomainSeed(BaseModel):
    name: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)


class DomainPlanResult(BaseModel):
    domains: list[DomainSeed] = Field(..., min_length=1)


class BadgeDraft(BaseModel):
    name: str = Field(..., min_length=1)
    type: BadgeType
    progress: int = Field(..., ge=0, le=100)
    is_completed: bool
    reason: str = Field(..., min_length=1)


class BadgeResult(BaseModel):
    badges: list[BadgeDraft] = Field(..., min_length=1)


class DomainInitialization(BaseModel):
    name: str = Field(..., min_length=1)
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str = Field(..., min_length=1)


class PathAssessment(BaseModel):
    level: int = Field(..., ge=1, le=get_max_level())
    domains: list[DomainInitialization] = Field(..., min_length=1)


class InitializedDomain(BaseModel):
    name: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str = Field(..., min_length=1)


class PathInitializationDraft(BaseModel):
    path_name: str = Field(..., min_length=1)
    level: int = Field(..., ge=1, le=get_max_level())
    domains: list[InitializedDomain] = Field(..., min_length=1)
    badges: list[BadgeDraft] = Field(..., min_length=1)


class WorkflowState(TypedDict, total=False):
    user_input: InitializePathRequest
    domain_plan: DomainPlanResult
    badge_plan: BadgeResult
    path_assessment: PathAssessment
    result: PathInitializationDraft


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
""".strip()


def build_level_and_proficiency_instruction() -> str:
    return f"""
You assess the initial level and domain proficiency for a new Level-Up Journey path.
Return only structured data for the requested schema, you should be slightly strict.

Task:
- Decide the initial path level (0-100). Strictly assign user levels based on user descriptions to avoid overestimating user levels.
   Reference: Beginner: 0-10, Experienced: 10-15, Proficient: 15-35, Expert: 35-60, Authority: 60-80, World-class: 80-90
- Assess each proposed domain with one rating from:
  Initiate, Apprentice, Practitioner, Specialist, Expert, Master
- Add one concise reason for each domain rating be harsh and realistic.
- Base the judgment on the user's current status and past achievements.
- Write all user-facing text in the requested language from the `lang` field.
""".strip()


def build_workflow():
    llm = get_llm()

    def build_path_and_domains_node(state: WorkflowState) -> WorkflowState:
        user_input = state["user_input"]
        result = invoke_structured_output(
            llm=llm,
            schema=DomainPlanResult,
            instruction=build_path_and_domains_instruction(),
            payload=user_input.model_dump(mode="json"),
        )
        return {"domain_plan": result}

    def build_badges_node(state: WorkflowState) -> WorkflowState:
        user_input = state["user_input"]
        result = invoke_structured_output(
            llm=llm,
            schema=BadgeResult,
            instruction=build_badge_instruction(),
            payload=user_input.model_dump(mode="json"),
        )
        normalized_badges = [
            badge.model_copy(update={"is_completed": badge.progress == 100})
            for badge in result.badges
        ]
        return {"badge_plan": BadgeResult(badges=normalized_badges)}

    def build_level_and_domain_proficiency_node(state: WorkflowState) -> WorkflowState:
        user_input = state["user_input"]
        domain_plan = state["domain_plan"]

        assessment = invoke_structured_output(
            llm=llm,
            schema=PathAssessment,
            instruction=build_level_and_proficiency_instruction(),
            payload={
                "user_input": user_input.model_dump(mode="json"),
                "path_name": user_input.route_name,
                "proposed_domains": domain_plan.model_dump(mode="json"),
            },
        )

        seed_summaries = {domain.name: domain.summary for domain in domain_plan.domains}
        assessed_domains = {domain.name: domain for domain in assessment.domains}

        merged_domains: list[InitializedDomain] = []
        for seeded in domain_plan.domains:
            assessed = assessed_domains.get(seeded.name)
            if assessed is None:
                merged_domains.append(
                    InitializedDomain(
                        name=seeded.name,
                        summary=seeded.summary,
                        proficiency_rating=DomainProficiencyRating.INITIATE,
                        proficiency_reason="Initial scaffold generated for this path.",
                    )
                )
                continue

            merged_domains.append(
                InitializedDomain(
                    name=assessed.name,
                    summary=seed_summaries.get(assessed.name, seeded.summary),
                    proficiency_rating=assessed.proficiency_rating,
                    proficiency_reason=assessed.proficiency_reason,
                )
            )

        result = PathInitializationDraft(
            path_name=user_input.route_name,
            level=assessment.level,
            domains=merged_domains,
            badges=state["badge_plan"].badges,
        )
        return {"path_assessment": assessment, "result": result}

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


def run_initialize_path_workflow(user_input: InitializePathRequest) -> PathInitializationDraft:
    workflow = build_workflow()
    state = workflow.invoke({"user_input": user_input})
    return state["result"]
