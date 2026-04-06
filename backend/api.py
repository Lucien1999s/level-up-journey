from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db import get_db, init_db
from src.logic import (
    AppError,
    add_badge,
    add_domain,
    delete_badge,
    delete_domain,
    get_all_paths,
    get_path_detail,
    initialize_path,
    process_action_log,
    update_badge,
    update_domain,
    update_path_progress,
)
from src.schemas import (
    ActionLogRequest,
    ActionLogResponse,
    BadgeCreateRequest,
    BadgeResponse,
    BadgeUpdateRequest,
    DomainCreateRequest,
    DomainResponse,
    DomainUpdateRequest,
    InitializePathRequest,
    JourneyDataResponse,
    PathDetailResponse,
    PathProgressUpdateRequest,
)


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)


def handle_app_error(error: AppError) -> None:
    raise HTTPException(status_code=error.status_code, detail=str(error)) from error


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/paths/initialize",
    response_model=PathDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def initialize_path_endpoint(
    request: InitializePathRequest,
    session: Session = Depends(get_db),
) -> PathDetailResponse:
    try:
        return initialize_path(session, request)
    except AppError as error:
        handle_app_error(error)


@app.get("/paths", response_model=JourneyDataResponse)
def list_paths(session: Session = Depends(get_db)) -> JourneyDataResponse:
    return get_all_paths(session)


@app.get("/paths/{path_id}", response_model=PathDetailResponse)
def get_path(path_id: int, session: Session = Depends(get_db)) -> PathDetailResponse:
    try:
        return get_path_detail(session, path_id)
    except AppError as error:
        handle_app_error(error)


@app.patch("/paths/{path_id}/progress", response_model=PathDetailResponse)
def patch_path_progress(
    path_id: int,
    request: PathProgressUpdateRequest,
    session: Session = Depends(get_db),
) -> PathDetailResponse:
    try:
        return update_path_progress(session, path_id, request)
    except AppError as error:
        handle_app_error(error)


@app.post("/action-logs/process", response_model=ActionLogResponse)
def process_action_log_endpoint(
    request: ActionLogRequest,
    session: Session = Depends(get_db),
) -> ActionLogResponse:
    try:
        return process_action_log(session, request)
    except AppError as error:
        handle_app_error(error)


@app.post(
    "/paths/{path_id}/badges",
    response_model=BadgeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_badge(
    path_id: int,
    request: BadgeCreateRequest,
    session: Session = Depends(get_db),
) -> BadgeResponse:
    try:
        return add_badge(session, path_id, request)
    except AppError as error:
        handle_app_error(error)


@app.patch("/badges/{badge_id}", response_model=BadgeResponse)
def patch_badge(
    badge_id: int,
    request: BadgeUpdateRequest,
    session: Session = Depends(get_db),
) -> BadgeResponse:
    try:
        return update_badge(session, badge_id, request)
    except AppError as error:
        handle_app_error(error)


@app.delete("/badges/{badge_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_badge(
    badge_id: int,
    session: Session = Depends(get_db),
) -> Response:
    try:
        delete_badge(session, badge_id)
    except AppError as error:
        handle_app_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/paths/{path_id}/domains",
    response_model=DomainResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_domain(
    path_id: int,
    request: DomainCreateRequest,
    session: Session = Depends(get_db),
) -> DomainResponse:
    try:
        return add_domain(session, path_id, request)
    except AppError as error:
        handle_app_error(error)


@app.patch("/domains/{domain_id}", response_model=DomainResponse)
def patch_domain(
    domain_id: int,
    request: DomainUpdateRequest,
    session: Session = Depends(get_db),
) -> DomainResponse:
    try:
        return update_domain(session, domain_id, request)
    except AppError as error:
        handle_app_error(error)


@app.delete("/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_domain(
    domain_id: int,
    session: Session = Depends(get_db),
) -> Response:
    try:
        delete_domain(session, domain_id)
    except AppError as error:
        handle_app_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

