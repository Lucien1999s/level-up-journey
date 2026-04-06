import json

from src.schemas import InitializePathRequest
from src.workflows.path_initialization import run_initialize_path_workflow


if __name__ == "__main__":
    example_input = InitializePathRequest(
        route_name="AI Inference",
        current_status="我目前正在學習vllm 會基礎知識而已",
        past_achievements="剛加入picomp-lab 美國研究所碩士負責相關研究",
        lang="en",
    )

    result = run_initialize_path_workflow(example_input)
    print(json.dumps(result.model_dump(mode="json"), indent=2, ensure_ascii=False))
