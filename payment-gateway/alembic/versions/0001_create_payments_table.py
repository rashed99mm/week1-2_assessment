"""Create the payments table.

The schema was previously produced by ``Base.metadata.create_all`` at start-up.
That works for a first run and silently does nothing thereafter — including
when a column's type changes, which is how ``amount`` stayed a Float long after
the model said Numeric. Migrations make the change explicit and repeatable.

Revision ID: 0001
Revises:
Create Date: 2026-09-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        # Indexed via create_index below rather than index=True, so the index
        # has an explicit name that downgrade() can drop.
        sa.Column("order_id", sa.Integer(), nullable=False),
        # Numeric, never Float: binary floating point cannot represent values
        # as ordinary as 0.10 exactly.
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("gateway_reference", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_payments_order_id", "payments", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_order_id", table_name="payments")
    op.drop_table("payments")
