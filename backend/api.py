from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from src.config import get_settings
from src.db import get_db, init_db
from src.logic import (
    AppError,
    add_badge,
    add_domain,
    delete_badge,
    delete_domain,
    delete_path,
    get_all_paths,
    get_path_detail,
    initialize_path,
    login_account,
    process_action_log,
    register_account,
    update_account_email,
    update_account_password,
    update_badge,
    update_domain,
    update_path_progress,
)
from src.schemas import (
    ActionLogRequest,
    ActionLogResponse,
    AccountUpdateRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthSessionResponse,
    BadgeCreateRequest,
    BadgeResponse,
    BadgeUpdateRequest,
    DomainCreateRequest,
    DomainResponse,
    DomainUpdateRequest,
    InitializePathRequest,
    JourneyDataResponse,
    PasswordUpdateRequest,
    PathDetailResponse,
    PathProgressUpdateRequest,
)


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def handle_app_error(error: AppError) -> None:
    raise HTTPException(status_code=error.status_code, detail=str(error)) from error


def get_current_user_email(
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
) -> str:
    if x_user_email is None or not x_user_email.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing user session.")
    return x_user_email.strip()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register", response_model=AuthSessionResponse, status_code=status.HTTP_201_CREATED)
def register_account_endpoint(
    request: AuthRegisterRequest,
    session: Session = Depends(get_db),
) -> AuthSessionResponse:
    try:
        return register_account(session, request)
    except AppError as error:
        handle_app_error(error)


@app.post("/auth/login", response_model=AuthSessionResponse)
def login_account_endpoint(
    request: AuthLoginRequest,
    session: Session = Depends(get_db),
) -> AuthSessionResponse:
    try:
        return login_account(session, request)
    except AppError as error:
        handle_app_error(error)


@app.patch("/auth/account", response_model=AuthSessionResponse)
def update_account_endpoint(
    request: AccountUpdateRequest,
    session: Session = Depends(get_db),
) -> AuthSessionResponse:
    try:
        return update_account_email(session, request)
    except AppError as error:
        handle_app_error(error)


@app.patch("/auth/password", response_model=AuthSessionResponse)
def update_password_endpoint(
    request: PasswordUpdateRequest,
    session: Session = Depends(get_db),
) -> AuthSessionResponse:
    try:
        return update_account_password(session, request)
    except AppError as error:
        handle_app_error(error)


@app.post(
    "/paths/initialize",
    response_model=PathDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def initialize_path_endpoint(
    request: InitializePathRequest,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> PathDetailResponse:
    try:
        return initialize_path(session, user_email, request)
    except AppError as error:
        handle_app_error(error)


@app.get("/paths", response_model=JourneyDataResponse)
def list_paths(
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> JourneyDataResponse:
    return get_all_paths(session, user_email)


@app.get("/paths/{path_id}", response_model=PathDetailResponse)
def get_path(
    path_id: int,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> PathDetailResponse:
    try:
        return get_path_detail(session, user_email, path_id)
    except AppError as error:
        handle_app_error(error)


@app.delete("/paths/{path_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_path(
    path_id: int,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> Response:
    try:
        delete_path(session, user_email, path_id)
    except AppError as error:
        handle_app_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch("/paths/{path_id}/progress", response_model=PathDetailResponse)
def patch_path_progress(
    path_id: int,
    request: PathProgressUpdateRequest,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> PathDetailResponse:
    try:
        return update_path_progress(session, user_email, path_id, request)
    except AppError as error:
        handle_app_error(error)


@app.post("/action-logs/process", response_model=ActionLogResponse)
def process_action_log_endpoint(
    request: ActionLogRequest,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> ActionLogResponse:
    try:
        return process_action_log(session, user_email, request)
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
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> BadgeResponse:
    try:
        return add_badge(session, user_email, path_id, request)
    except AppError as error:
        handle_app_error(error)


@app.patch("/badges/{badge_id}", response_model=BadgeResponse)
def patch_badge(
    badge_id: int,
    request: BadgeUpdateRequest,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> BadgeResponse:
    try:
        return update_badge(session, user_email, badge_id, request)
    except AppError as error:
        handle_app_error(error)


@app.delete("/badges/{badge_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_badge(
    badge_id: int,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> Response:
    try:
        delete_badge(session, user_email, badge_id)
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
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> DomainResponse:
    try:
        return add_domain(session, user_email, path_id, request)
    except AppError as error:
        handle_app_error(error)


@app.patch("/domains/{domain_id}", response_model=DomainResponse)
def patch_domain(
    domain_id: int,
    request: DomainUpdateRequest,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> DomainResponse:
    try:
        return update_domain(session, user_email, domain_id, request)
    except AppError as error:
        handle_app_error(error)


@app.delete("/domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_domain(
    domain_id: int,
    user_email: str = Depends(get_current_user_email),
    session: Session = Depends(get_db),
) -> Response:
    try:
        delete_domain(session, user_email, domain_id)
    except AppError as error:
        handle_app_error(error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
