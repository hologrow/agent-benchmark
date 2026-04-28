"""add test_cases created_by

Revision ID: 9517a1ff5480
Revises: c9b650a043fc
Create Date: 2026-04-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9517a1ff5480"
down_revision: Union[str, Sequence[str], None] = "c9b650a043fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "test_cases",
        sa.Column(
            "created_by",
            sa.Text(),
            nullable=False,
            server_default=sa.text("''"),
        ),
    )


def downgrade() -> None:
    op.drop_column("test_cases", "created_by")
