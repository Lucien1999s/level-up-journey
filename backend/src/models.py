from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UserModel(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    paths: Mapped[list["PathModel"]] = relationship(
        back_populates="user",
        order_by="PathModel.id",
    )


class PathModel(TimestampMixin, Base):
    __tablename__ = "paths"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_path_per_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    current_status: Mapped[str] = mapped_column(Text, nullable=False)
    past_achievements: Mapped[str] = mapped_column(Text, nullable=False)
    lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    user: Mapped["UserModel | None"] = relationship(back_populates="paths")

    domains: Mapped[list["DomainModel"]] = relationship(
        back_populates="path",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DomainModel.id",
    )
    badges: Mapped[list["BadgeModel"]] = relationship(
        back_populates="path",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BadgeModel.id",
    )


class DomainModel(TimestampMixin, Base):
    __tablename__ = "domains"
    __table_args__ = (UniqueConstraint("path_id", "name", name="uq_domain_per_path"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    path_id: Mapped[int] = mapped_column(
        ForeignKey("paths.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    proficiency_rating: Mapped[str] = mapped_column(String(32), nullable=False)
    proficiency_reason: Mapped[str] = mapped_column(Text, nullable=False)

    path: Mapped["PathModel"] = relationship(back_populates="domains")


class BadgeModel(TimestampMixin, Base):
    __tablename__ = "badges"
    __table_args__ = (UniqueConstraint("path_id", "name", name="uq_badge_per_path"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    path_id: Mapped[int] = mapped_column(
        ForeignKey("paths.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    tier: Mapped[str] = mapped_column(String(16), nullable=False, default="bronze")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_completed: Mapped[bool] = mapped_column(nullable=False, default=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    path: Mapped["PathModel"] = relationship(back_populates="badges")
