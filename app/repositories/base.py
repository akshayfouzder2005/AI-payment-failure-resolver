"""
Generic repository base class.

Repositories are the only layer allowed to construct SQLAlchemy queries.
Services depend on repositories, never on `Session`/ORM internals directly
(with the narrow exception of the session itself being passed in, so
services can control transaction boundaries — see note in each service
once those exist).
"""
import uuid
from typing import Generic, TypeVar

from sqlalchemy.orm import Session

ModelType = TypeVar("ModelType")


class BaseRepository(Generic[ModelType]):
    model: type[ModelType]

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, id_: uuid.UUID) -> ModelType | None:
        return self.db.get(self.model, id_)

    def add(self, obj: ModelType) -> ModelType:
        self.db.add(obj)
        self.db.flush()  # assigns PK/defaults without ending the transaction
        return obj

    def list_all(self, limit: int = 100, offset: int = 0) -> list[ModelType]:
        from sqlalchemy import select

        stmt = select(self.model).limit(limit).offset(offset)
        return list(self.db.scalars(stmt).all())
