"""recovery attempt execution fields (Phase 5)

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-13 00:00:00.000000

Adds the columns RecoveryExecutionService needs to record a full
execution lifecycle on `recovery_attempts`:

- `executed_at` is renamed to `completed_at` for clarity now that there's
  also a `started_at` — a single "executed_at" was ambiguous once an
  attempt has a start and an end.
- `started_at` is new: set when an executor is handed the action.
- `error_message` is new: kept separate from `result_message` so a
  successful attempt's human-readable outcome and a failed attempt's
  error text are never conflated in the same column.

Safe to run on a fresh (empty) `recovery_attempts` table — nothing has
written to this table before Phase 5, per PHASE_4_NOTES.md.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "recovery_attempts",
        "executed_at",
        new_column_name="completed_at",
    )
    op.add_column(
        "recovery_attempts",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "recovery_attempts",
        sa.Column("error_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recovery_attempts", "error_message")
    op.drop_column("recovery_attempts", "started_at")
    op.alter_column(
        "recovery_attempts",
        "completed_at",
        new_column_name="executed_at",
    )
