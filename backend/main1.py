import json

from src.schemas import BadgeType, DomainProficiencyRating
from src.workflows.action_log import (
    ActionLogWorkflowInput,
    BadgeSnapshot,
    DomainSnapshot,
    PathSnapshot,
    PlayerPathSnapshot,
    run_action_log_workflow,
)


if __name__ == "__main__":
    existing_paths = [
        PlayerPathSnapshot(
            path=PathSnapshot(id=1, name="AI Inference", level=10, total_exp=2507),
            domains=[
                DomainSnapshot(
                    name="Core Concepts & Architectures",
                    summary="Foundational AI and inference architecture knowledge.",
                    proficiency_rating=DomainProficiencyRating.PRACTITIONER,
                    proficiency_reason="Academic background as a master's student suggests foundational knowledge of AI/ML concepts.",
                ),
                DomainSnapshot(
                    name="Inference Serving Frameworks (e.g., vLLM)",
                    summary="Serving frameworks and deployment practices for inference.",
                    proficiency_rating=DomainProficiencyRating.APPRENTICE,
                    proficiency_reason="Currently learning vLLM with only basic foundational knowledge.",
                ),
            ],
            badges=[
                BadgeSnapshot(
                    name="vLLM Explorer",
                    type=BadgeType.ACHIEVEMENT,
                    progress=25,
                    is_completed=False,
                    reason="Awarded for actively beginning your journey into vLLM.",
                )
            ],
        )
    ]

    example_input = ActionLogWorkflowInput(
        action_log=(
            "Today I deployed a vLLM inference service on our HPC environment "
            "and tuned batch size and concurrency settings."
        ),
        existing_paths=existing_paths,
        lang="en",
    )

    result = run_action_log_workflow(example_input)
    print(json.dumps(result.model_dump(mode="json"), indent=2, ensure_ascii=False))
