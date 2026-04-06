from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.leveling import cumulative_xp_for_level, level_for_total_xp, xp_to_next_level
from src.models import BadgeModel, DomainModel, PathModel
from src.schemas import (
    ActionLogRequest,
    ActionLogResponse,
    BadgeActionUpdateResponse,
    BadgeCreateRequest,
    BadgeResponse,
    BadgeUpdateRequest,
    DomainActionUpdateResponse,
    DomainCreateRequest,
    DomainResponse,
    DomainUpdateRequest,
    InitializePathRequest,
    JourneyDataResponse,
    MatchedActionGroupResponse,
    PathActionUpdateResponse,
    PathDetailResponse,
    PathProgressResponse,
    PathProgressUpdateRequest,
)
from src.workflows.action_log import ActionLogWorkflowInput, PlayerPathSnapshot, run_action_log_workflow
from src.workflows.path_initialization import run_initialize_path_workflow


class AppError(Exception):
    status_code = 400


class ConflictError(AppError):
    status_code = 409


class NotFoundError(AppError):
    status_code = 404


def _load_paths_query():
    return (
        select(PathModel)
        .options(
            selectinload(PathModel.domains),
            selectinload(PathModel.badges),
        )
        .order_by(PathModel.id)
    )


def _get_path(session: Session, path_id: int) -> PathModel:
    path = session.scalar(_load_paths_query().where(PathModel.id == path_id))
    if path is None:
        raise NotFoundError("Path not found.")
    return path


def _get_badge(session: Session, badge_id: int) -> BadgeModel:
    badge = session.get(BadgeModel, badge_id)
    if badge is None:
        raise NotFoundError("Badge not found.")
    return badge


def _get_domain(session: Session, domain_id: int) -> DomainModel:
    domain = session.get(DomainModel, domain_id)
    if domain is None:
        raise NotFoundError("Domain not found.")
    return domain


def _serialize_path(path: PathModel) -> PathDetailResponse:
    return PathDetailResponse(
        path=PathProgressResponse(
            id=path.id,
            name=path.name,
            level=path.level,
            total_exp=path.total_exp,
            xp_to_next_level=xp_to_next_level(path.total_exp),
            current_status=path.current_status,
            past_achievements=path.past_achievements,
            lang=path.lang,
        ),
        domains=[
            DomainResponse(
                id=domain.id,
                name=domain.name,
                summary=domain.summary,
                proficiency_rating=domain.proficiency_rating,
                proficiency_reason=domain.proficiency_reason,
            )
            for domain in path.domains
        ],
        badges=[
            BadgeResponse(
                id=badge.id,
                name=badge.name,
                type=badge.type,
                progress=badge.progress,
                is_completed=badge.is_completed,
                reason=badge.reason,
            )
            for badge in path.badges
        ],
    )


def _path_to_snapshot(path: PathModel) -> PlayerPathSnapshot:
    return PlayerPathSnapshot.model_validate(_serialize_path(path).model_dump())


def initialize_path(session: Session, request: InitializePathRequest) -> PathDetailResponse:
    existing = session.scalar(select(PathModel).where(PathModel.name == request.route_name))
    if existing is not None:
        raise ConflictError("A path with this name already exists.")

    draft = run_initialize_path_workflow(request)

    path = PathModel(
        name=draft.path_name,
        current_status=request.current_status,
        past_achievements=request.past_achievements,
        lang=request.lang,
        level=draft.level,
        total_exp=cumulative_xp_for_level(draft.level),
    )
    session.add(path)
    session.flush()

    for domain in draft.domains:
        path.domains.append(
            DomainModel(
                name=domain.name,
                summary=domain.summary,
                proficiency_rating=domain.proficiency_rating.value,
                proficiency_reason=domain.proficiency_reason,
            )
        )

    for badge in draft.badges:
        path.badges.append(
            BadgeModel(
                name=badge.name,
                type=badge.type.value,
                progress=badge.progress,
                is_completed=badge.progress == 100,
                reason=badge.reason,
            )
        )

    session.commit()
    session.refresh(path)
    path = _get_path(session, path.id)
    return _serialize_path(path)


def get_all_paths(session: Session) -> JourneyDataResponse:
    paths = session.scalars(_load_paths_query()).all()
    return JourneyDataResponse(paths=[_serialize_path(path) for path in paths])


def get_path_detail(session: Session, path_id: int) -> PathDetailResponse:
    return _serialize_path(_get_path(session, path_id))


def update_path_progress(
    session: Session,
    path_id: int,
    request: PathProgressUpdateRequest,
) -> PathDetailResponse:
    path = _get_path(session, path_id)
    path.total_exp = request.total_exp
    path.level = level_for_total_xp(request.total_exp)
    session.commit()
    session.refresh(path)
    path = _get_path(session, path.id)
    return _serialize_path(path)


def add_badge(session: Session, path_id: int, request: BadgeCreateRequest) -> BadgeResponse:
    path = _get_path(session, path_id)
    if any(badge.name == request.name for badge in path.badges):
        raise ConflictError("A badge with this name already exists on the path.")

    badge = BadgeModel(
        path_id=path.id,
        name=request.name,
        type=request.type.value,
        progress=request.progress,
        is_completed=request.progress == 100,
        reason=request.reason,
    )
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return BadgeResponse(
        id=badge.id,
        name=badge.name,
        type=badge.type,
        progress=badge.progress,
        is_completed=badge.is_completed,
        reason=badge.reason,
    )


def update_badge(session: Session, badge_id: int, request: BadgeUpdateRequest) -> BadgeResponse:
    badge = _get_badge(session, badge_id)
    if request.name and request.name != badge.name:
        sibling = session.scalar(
            select(BadgeModel).where(
                BadgeModel.path_id == badge.path_id,
                BadgeModel.name == request.name,
            )
        )
        if sibling is not None:
            raise ConflictError("A badge with this name already exists on the path.")
        badge.name = request.name

    if request.type is not None:
        badge.type = request.type.value
    if request.progress is not None:
        badge.progress = request.progress
        badge.is_completed = badge.progress == 100
    if request.reason is not None:
        badge.reason = request.reason

    session.commit()
    session.refresh(badge)
    return BadgeResponse(
        id=badge.id,
        name=badge.name,
        type=badge.type,
        progress=badge.progress,
        is_completed=badge.is_completed,
        reason=badge.reason,
    )


def delete_badge(session: Session, badge_id: int) -> None:
    badge = _get_badge(session, badge_id)
    session.delete(badge)
    session.commit()


def add_domain(session: Session, path_id: int, request: DomainCreateRequest) -> DomainResponse:
    path = _get_path(session, path_id)
    if any(domain.name == request.name for domain in path.domains):
        raise ConflictError("A domain with this name already exists on the path.")

    domain = DomainModel(
        path_id=path.id,
        name=request.name,
        summary=request.summary,
        proficiency_rating=request.proficiency_rating.value,
        proficiency_reason=request.proficiency_reason,
    )
    session.add(domain)
    session.commit()
    session.refresh(domain)
    return DomainResponse(
        id=domain.id,
        name=domain.name,
        summary=domain.summary,
        proficiency_rating=domain.proficiency_rating,
        proficiency_reason=domain.proficiency_reason,
    )


def update_domain(session: Session, domain_id: int, request: DomainUpdateRequest) -> DomainResponse:
    domain = _get_domain(session, domain_id)
    if request.name and request.name != domain.name:
        sibling = session.scalar(
            select(DomainModel).where(
                DomainModel.path_id == domain.path_id,
                DomainModel.name == request.name,
            )
        )
        if sibling is not None:
            raise ConflictError("A domain with this name already exists on the path.")
        domain.name = request.name

    if request.summary is not None:
        domain.summary = request.summary
    if request.proficiency_rating is not None:
        domain.proficiency_rating = request.proficiency_rating.value
    if request.proficiency_reason is not None:
        domain.proficiency_reason = request.proficiency_reason

    session.commit()
    session.refresh(domain)
    return DomainResponse(
        id=domain.id,
        name=domain.name,
        summary=domain.summary,
        proficiency_rating=domain.proficiency_rating,
        proficiency_reason=domain.proficiency_reason,
    )


def delete_domain(session: Session, domain_id: int) -> None:
    domain = _get_domain(session, domain_id)
    session.delete(domain)
    session.commit()


def process_action_log(session: Session, request: ActionLogRequest) -> ActionLogResponse:
    path_models = session.scalars(_load_paths_query()).all()
    if not path_models:
        raise AppError("No paths exist yet. Initialize at least one path first.")

    snapshots = [_path_to_snapshot(path) for path in path_models]
    draft = run_action_log_workflow(
        ActionLogWorkflowInput(
            action_log=request.action_log,
            existing_paths=snapshots,
            lang=request.lang,
        )
    )

    path_by_name = {path.name: path for path in path_models}
    matched_by_name = {
        bundle.path_name: bundle for bundle in draft.matched_action_groups
    }

    path_updates: list[PathActionUpdateResponse] = []
    badge_updates: list[BadgeActionUpdateResponse] = []

    for plan in draft.path_update_plans:
        path = path_by_name.get(plan.path_name)
        if path is None:
            continue

        previous_level = path.level
        exp_gain = 100 + plan.bonus_exp
        path.total_exp += exp_gain
        path.level = level_for_total_xp(path.total_exp)

        domains_by_name = {domain.name: domain for domain in path.domains}
        domain_updates: list[DomainActionUpdateResponse] = []
        for update in plan.domain_updates:
            domain = domains_by_name.get(update.name)
            if domain is None:
                domain = DomainModel(
                    path_id=path.id,
                    name=update.name,
                    summary=update.action_summary,
                    proficiency_rating=update.proficiency_rating.value,
                    proficiency_reason=update.proficiency_reason,
                )
                session.add(domain)
                path.domains.append(domain)
                session.flush()
                domains_by_name[domain.name] = domain
                is_new = True
            else:
                domain.summary = update.action_summary
                domain.proficiency_rating = update.proficiency_rating.value
                domain.proficiency_reason = update.proficiency_reason
                is_new = False

            domain_updates.append(
                DomainActionUpdateResponse(
                    domain_id=domain.id,
                    name=domain.name,
                    is_new=is_new,
                    action_summary=update.action_summary,
                    proficiency_rating=update.proficiency_rating,
                    proficiency_reason=update.proficiency_reason,
                )
            )

        evidence = matched_by_name.get(plan.path_name)
        path_updates.append(
            PathActionUpdateResponse(
                path_id=path.id,
                path_name=path.name,
                previous_level=previous_level,
                new_level=path.level,
                exp_gain=exp_gain,
                new_total_exp=path.total_exp,
                evidence=evidence.relevant_action_excerpt if evidence else "",
                feedback=plan.feedback,
                domain_updates=domain_updates,
            )
        )

    for badge_plan in draft.badge_update_plans:
        path = path_by_name.get(badge_plan.path_name)
        if path is None:
            continue

        for badge in path.badges:
            if badge.name != badge_plan.badge_name or badge.is_completed:
                continue

            previous_progress = badge.progress
            badge.progress = min(100, badge.progress + badge_plan.progress_delta)
            badge.is_completed = badge.progress == 100
            badge.reason = badge_plan.reason
            badge_updates.append(
                BadgeActionUpdateResponse(
                    path_id=path.id,
                    badge_id=badge.id,
                    badge_name=badge.name,
                    previous_progress=previous_progress,
                    new_progress=badge.progress,
                    is_completed=badge.is_completed,
                    reason=badge.reason,
                )
            )
            break

    session.commit()

    matched_groups = [
        MatchedActionGroupResponse(
            path_id=path_by_name[bundle.path_name].id,
            path_name=bundle.path_name,
            matched_domains=bundle.matched_domains,
            evidence=bundle.relevant_action_excerpt,
        )
        for bundle in draft.matched_action_groups
        if bundle.path_name in path_by_name
    ]

    return ActionLogResponse(
        action_log=request.action_log,
        matched_action_groups=matched_groups,
        path_updates=path_updates,
        badge_updates=badge_updates,
    )
