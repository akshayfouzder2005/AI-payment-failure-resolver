from sqlalchemy import select

from app.models.merchant_settings import MerchantSettings
from app.repositories.base import BaseRepository


class MerchantSettingsRepository(BaseRepository[MerchantSettings]):
    model = MerchantSettings

    def get_by_merchant_id(self, merchant_id: str) -> MerchantSettings | None:
        stmt = select(MerchantSettings).where(MerchantSettings.merchant_id == merchant_id)
        return self.db.scalars(stmt).first()
