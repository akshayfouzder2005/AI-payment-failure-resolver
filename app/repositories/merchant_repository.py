from app.models.merchant import Merchant
from app.repositories.base import BaseRepository


class MerchantRepository(BaseRepository[Merchant]):
    """
    Merchant.merchant_id IS the primary key (see the model's docstring),
    so BaseRepository.get_by_id(merchant_id) already does the one lookup
    this table needs — nothing else to add here yet.
    """

    model = Merchant
