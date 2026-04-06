import json

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from src.config import get_settings


def get_llm() -> ChatGoogleGenerativeAI:
    settings = get_settings()
    if not settings.google_api_key:
        raise RuntimeError("GOOGLE_API_KEY is missing from the environment.")

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        api_key=settings.google_api_key,
        temperature=0.2,
    )


def invoke_structured_output(
    llm: ChatGoogleGenerativeAI,
    schema: type[BaseModel],
    instruction: str,
    payload: dict,
) -> BaseModel:
    structured_llm = llm.with_structured_output(schema)
    return structured_llm.invoke(
        [
            SystemMessage(content=instruction),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False, indent=2)),
        ]
    )

