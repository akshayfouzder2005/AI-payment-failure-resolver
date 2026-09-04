from sqlalchemy import select

from app.models.customer import Customer
from app.repositories.base import BaseRepository


class CustomerRepository(BaseRepository[Customer]):
    model = Customer

    def get_by_email(self, email: str) -> Customer | None:
        stmt = select(Customer).where(Customer.email == email)
        return self.db.scalars(stmt).first()

    def get_by_external_id(self, external_id: str) -> Customer | None:
        stmt = select(Customer).where(Customer.external_id == external_id)
        return self.db.scalars(stmt).first()
