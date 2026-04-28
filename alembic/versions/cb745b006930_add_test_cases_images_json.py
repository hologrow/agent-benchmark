"""add test_cases images_json

Revision ID: cb745b006930
Revises: 9517a1ff5480
Create Date: 2026-04-28 16:05:06.647498

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cb745b006930"
down_revision: Union[str, Sequence[str], None] = "9517a1ff5480"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "test_cases",
        sa.Column("images_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("test_cases", "images_json")
