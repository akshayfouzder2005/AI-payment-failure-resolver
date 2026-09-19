"""add merchants and users tables (Phase 7 - auth)

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-19 00:00:00.000000

Introduces the User/Merchant ownership layer:

- `merchants`: a real, first-class identity for the merchant_id string
  every existing table already keys off of. Primary key IS merchant_id
  (no separate UUID `id`) — see app/models/merchant.py's docstring for
  why: every existing FK (MerchantSettings.merchant_id, Payment.merchant_id)
  already points at this string, so reusing it keeps this a pure additive
  change with no data migration on those tables.
- `users`: one row per person who can log into RecoverAI, FK'd to
  merchants.merchant_id.
- A real FK from merchant_settings.merchant_id -> merchants.merchant_id
  (previously just UNIQUE, no FK).

Backfill-then-constrain: the INSERT below runs BEFORE the FK is added,
so this is safe to run against a database that already has
merchant_settings/payments rows from Phases 1-6 (Akshay's local dev DB)
-- every merchant_id already in use gets a matching `merchants` row
first, so the FK never fails against pre-existing data.

Safe on a completely fresh database too: the backfill SELECT simply
returns zero rows there, and PaymentService.ensure_default_merchant()
(updated alongside this migration) creates both the Merchant and
MerchantSettings row together on first use going forward, so the
"empty tables today, first webhook tomorrow" case is also covered
without this migration having to guess at a merchant_id.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'merchants',
        sa.Column('merchant_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('merchant_id'),
    )

    # Backfill BEFORE the FK below: one merchants row for every
    # merchant_id that already exists in merchant_settings (Phases 1-6
    # data), named after itself since no better display name exists yet
    # (an operator can rename it later via a future settings UI/admin
    # script — out of scope for this MVP).
    op.execute(
        """
        INSERT INTO merchants (merchant_id, name, is_active, created_at, updated_at)
        SELECT merchant_id, merchant_id, true, now(), now()
        FROM merchant_settings
        ON CONFLICT (merchant_id) DO NOTHING
        """
    )

    op.create_foreign_key(
        'fk_merchant_settings_merchant_id',
        'merchant_settings',
        'merchants',
        ['merchant_id'],
        ['merchant_id'],
    )

    op.create_table(
        'users',
        sa.Column('merchant_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['merchant_id'], ['merchants.merchant_id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_merchant_id'), 'users', ['merchant_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_merchant_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_constraint('fk_merchant_settings_merchant_id', 'merchant_settings', type_='foreignkey')
    op.drop_table('merchants')
