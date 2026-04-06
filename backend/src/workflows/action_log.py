import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from pydantic import BaseModel, Field, field_validator

from src.llm import get_llm, invoke_structured_output
from src.schemas import BadgeType, DomainProficiencyRating


class DomainSnapshot(BaseModel):
    name: str = Field(..., min_length=1)
    summary: str = Field(default="")
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str = Field(..., min_length=1)


class BadgeSnapshot(BaseModel):
    name: str = Field(..., min_length=1)
    type: BadgeType
    progress: int = Field(..., ge=0, le=100)
    is_completed: bool
    reason: str = Field(..., min_length=1)


class PathSnapshot(BaseModel):
    id: int
    name: str = Field(..., min_length=1)
    level: int = Field(..., ge=1)
    total_exp: int = Field(..., ge=0)


class PlayerPathSnapshot(BaseModel):
    path: PathSnapshot
    domains: list[DomainSnapshot] = Field(default_factory=list)
    badges: list[BadgeSnapshot] = Field(default_factory=list)


class ActionLogWorkflowInput(BaseModel):
    action_log: str = Field(..., min_length=1)
    existing_paths: list[PlayerPathSnapshot] = Field(..., min_length=1)
    lang: str = Field(default="en", min_length=2)

    @field_validator("action_log", "lang")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("action_log and lang must be non-empty strings.")
        return cleaned


class MatchedActionBundle(BaseModel):
    path_name: str = Field(..., min_length=1)
    matched_domains: list[str] = Field(default_factory=list)
    relevant_action_excerpt: str = Field(..., min_length=1)


class ActionRoutingResult(BaseModel):
    impacted_paths: list[MatchedActionBundle] = Field(default_factory=list)


class DomainUpdatePlan(BaseModel):
    name: str = Field(..., min_length=1)
    proficiency_rating: DomainProficiencyRating
    proficiency_reason: str = Field(..., min_length=1)
    action_summary: str = Field(..., min_length=1)
    is_new: bool = False


class PathUpdatePlan(BaseModel):
    path_name: str = Field(..., min_length=1)
    bonus_exp: int = Field(..., ge=0, le=900)
    feedback: str = Field(..., min_length=1)
    domain_updates: list[DomainUpdatePlan] = Field(default_factory=list)


class BadgeProgressUpdate(BaseModel):
    path_name: str = Field(..., min_length=1)
    badge_name: str = Field(..., min_length=1)
    progress_delta: int = Field(..., ge=0, le=100)
    reason: str = Field(..., min_length=1)


class BadgeUpdateResult(BaseModel):
    updates: list[BadgeProgressUpdate] = Field(default_factory=list)


class ActionLogWorkflowDraft(BaseModel):
    matched_action_groups: list[MatchedActionBundle] = Field(default_factory=list)
    path_update_plans: list[PathUpdatePlan] = Field(default_factory=list)
    badge_update_plans: list[BadgeProgressUpdate] = Field(default_factory=list)


class ActionWorkflowState(TypedDict, total=False):
    user_input: ActionLogWorkflowInput
    routing_result: ActionRoutingResult
    path_updates: Annotated[list[PathUpdatePlan], operator.add]
    badge_updates: list[BadgeProgressUpdate]


def build_action_routing_instruction() -> str:
    return f"""
You classify one action log into existing Level-Up Journey paths and domains.
Return only structured data for the requested schema.

Task:
- Only match existing paths. Never create a new path.
- Ignore unaffected paths entirely.
- For each impacted path, identify the existing domains that are clearly affected.
- If no existing domain is a clear fit, return the path with an empty matched_domains list.
- Include one concise action excerpt or summary for why this path is impacted.
- Be conservative and avoid broad matching.
- Write all user-facing text in the requested language from the `lang` field.
""".strip()


def build_path_update_instruction() -> str:
    return f"""
You update one impacted Level-Up Journey path from a single action log.
Return only structured data for the requested schema.

Task:
- Judge only this one impacted path.
- Assign a strict bonus_exp from 0 to 900.
- The system will add a guaranteed base 100 exp separately, so bonus_exp should only reflect the extra value beyond that baseline.
- Be strict: routine or shallow work should get low bonus_exp.
- Update only domains that show meaningful evidence from this action.
- You may propose a new domain only when the action clearly introduces a sustained skill area not covered by existing domains.
- For each updated domain, provide the latest proficiency_rating and a concise cumulative proficiency_reason.
- Domain proficiency should consider both the accumulated description and the player's current path level.
- Provide one or two concise sentences of overall feedback for the user.
- Write all user-facing text in the requested language from the `lang` field.
""".strip()


def build_badge_update_instruction() -> str:
    return f"""
You evaluate incomplete badges for impacted paths after a single action log.
Return only structured data for the requested schema.

Task:
- Only evaluate incomplete badges from impacted paths.
- Increase badge progress only when the action log provides clear evidence.
- Be strict and cautious. Most action logs should not cause large badge jumps.
- Do not create new badges.
- If there is not enough evidence, return no update for that badge.
- Keep progress_delta modest unless the evidence is unusually strong.
- Write all user-facing text in the requested language from the `lang` field.
""".strip()


def build_workflow():
    llm = get_llm()

    def classify_action_log_node(state: ActionWorkflowState) -> ActionWorkflowState:
        user_input = state["user_input"]
        catalog = [
            {
                "path_name": record.path.name,
                "path_level": record.path.level,
                "domains": [domain.name for domain in record.domains],
            }
            for record in user_input.existing_paths
        ]
        routing_result = invoke_structured_output(
            llm=llm,
            schema=ActionRoutingResult,
            instruction=build_action_routing_instruction(),
            payload={
                "action_log": user_input.action_log,
                "lang": user_input.lang,
                "path_catalog": catalog,
            },
        )
        return {"routing_result": routing_result}

    def fan_out_path_updates(state: ActionWorkflowState) -> list[Send]:
        user_input = state["user_input"]
        routing_result = state["routing_result"]
        path_map = {
            record.path.name: record.model_dump(mode="json")
            for record in user_input.existing_paths
        }

        sends: list[Send] = []
        for bundle in routing_result.impacted_paths:
            if bundle.path_name not in path_map:
                continue
            sends.append(
                Send(
                    "update_impacted_path",
                    {
                        "user_input": user_input.model_dump(mode="json"),
                        "path_bundle": bundle.model_dump(mode="json"),
                        "path_record": path_map[bundle.path_name],
                    },
                )
            )
        return sends

    def update_impacted_path_node(path_state: dict) -> ActionWorkflowState:
        user_input = ActionLogWorkflowInput(**path_state["user_input"])
        path_bundle = MatchedActionBundle(**path_state["path_bundle"])
        path_record = PlayerPathSnapshot(**path_state["path_record"])

        result = invoke_structured_output(
            llm=llm,
            schema=PathUpdatePlan,
            instruction=build_path_update_instruction(),
            payload={
                "action_log": user_input.action_log,
                "lang": user_input.lang,
                "matched_path": path_bundle.model_dump(mode="json"),
                "existing_path_record": path_record.model_dump(mode="json"),
            },
        )
        return {
            "path_updates": [
                result.model_copy(update={"path_name": path_record.path.name})
            ]
        }

    def update_badges_node(state: ActionWorkflowState) -> ActionWorkflowState:
        user_input = state["user_input"]
        impacted_names = {bundle.path_name for bundle in state["routing_result"].impacted_paths}
        incomplete_badges = []

        for record in user_input.existing_paths:
            if record.path.name not in impacted_names:
                continue
            for badge in record.badges:
                if badge.is_completed:
                    continue
                incomplete_badges.append(
                    {
                        "path_name": record.path.name,
                        "badge": badge.model_dump(mode="json"),
                    }
                )

        if not incomplete_badges:
            return {"badge_updates": []}

        result = invoke_structured_output(
            llm=llm,
            schema=BadgeUpdateResult,
            instruction=build_badge_update_instruction(),
            payload={
                "action_log": user_input.action_log,
                "lang": user_input.lang,
                "matched_paths": [
                    bundle.model_dump(mode="json")
                    for bundle in state["routing_result"].impacted_paths
                ],
                "candidate_badges": incomplete_badges,
            },
        )
        return {"badge_updates": result.updates}

    graph = StateGraph(ActionWorkflowState)
    graph.add_node("classify_action_log", classify_action_log_node)
    graph.add_node("update_impacted_path", update_impacted_path_node)
    graph.add_node("update_badges", update_badges_node)
    graph.add_edge(START, "classify_action_log")
    graph.add_conditional_edges("classify_action_log", fan_out_path_updates)
    graph.add_edge("classify_action_log", "update_badges")
    graph.add_edge("update_impacted_path", END)
    graph.add_edge("update_badges", END)
    return graph.compile()


def run_action_log_workflow(user_input: ActionLogWorkflowInput) -> ActionLogWorkflowDraft:
    workflow = build_workflow()
    state = workflow.invoke({"user_input": user_input})
    return ActionLogWorkflowDraft(
        matched_action_groups=state["routing_result"].impacted_paths,
        path_update_plans=state.get("path_updates", []),
        badge_update_plans=state.get("badge_updates", []),
    )
