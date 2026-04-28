"""
SQLAlchemy models for Alembic autogenerate.
Kept in sync with the SQLite schema used by the Next.js app (better-sqlite3).
"""

from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


_ts = text("CURRENT_TIMESTAMP")


class LLMModel(Base):
    __tablename__ = "models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    model_id: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[str] = mapped_column(String, default="anthropic")
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (Index("idx_agents_agent_type", "agent_type"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    command: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    agent_type: Mapped[str] = mapped_column(String, default="other")
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    forbidden_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    how: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    images_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class Evaluator(Base):
    __tablename__ = "evaluators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    script_path: Mapped[str] = mapped_column(Text, nullable=False)
    config: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("models.id"), nullable=True
    )
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class TestSet(Base):
    __tablename__ = "test_sets"
    __table_args__ = (Index("idx_test_sets_source", "source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class TestSetItem(Base):
    __tablename__ = "test_set_items"
    __table_args__ = (
        UniqueConstraint("test_set_id", "test_case_id", name="uq_test_set_items_set_case"),
        Index("idx_test_set_items_test_set_id", "test_set_id"),
        Index("idx_test_set_items_test_case_id", "test_case_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_set_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("test_sets.id", ondelete="CASCADE"), nullable=False
    )
    test_case_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("test_cases.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class Benchmark(Base):
    __tablename__ = "benchmarks"
    __table_args__ = (
        Index("idx_benchmarks_evaluator_id", "evaluator_id"),
        Index("idx_benchmarks_test_set_id", "test_set_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_ids: Mapped[str] = mapped_column(Text, nullable=False)
    test_case_ids: Mapped[str] = mapped_column(Text, nullable=False)
    test_set_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evaluator_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("evaluators.id"), nullable=True
    )
    run_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class BenchmarkExecution(Base):
    __tablename__ = "benchmark_executions"
    __table_args__ = (
        Index("idx_benchmark_executions_benchmark_id", "benchmark_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    benchmark_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("benchmarks.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    evaluation_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"
    __table_args__ = (
        Index("idx_benchmark_results_execution_id", "execution_id"),
        Index("idx_benchmark_results_agent_id", "agent_id"),
        Index("idx_benchmark_results_test_case_id", "test_case_id"),
        Index("idx_benchmark_results_magic_code", "magic_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("benchmark_executions.id", ondelete="CASCADE"),
        nullable=False,
    )
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), nullable=False)
    test_case_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("test_cases.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, default="pending")
    actual_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    magic_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class Evaluation(Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        Index("idx_evaluations_execution_id", "execution_id"),
        Index("idx_evaluations_result_id", "result_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("benchmark_executions.id", ondelete="CASCADE"),
        nullable=False,
    )
    result_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("benchmark_results.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    report: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_points_met: Mapped[str | None] = mapped_column(Text, nullable=True)
    forbidden_points_violated: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class Integration(Base):
    __tablename__ = "integrations"
    __table_args__ = (Index("idx_integrations_type", "type"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    updated_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class ExecutionTrace(Base):
    __tablename__ = "execution_traces"
    __table_args__ = (
        Index("idx_execution_traces_result_id", "result_id"),
        Index("idx_execution_traces_trace_id", "trace_id"),
        Index("idx_execution_traces_magic_code", "magic_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    result_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("benchmark_results.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    trace_id: Mapped[str] = mapped_column(Text, nullable=False)
    magic_code: Mapped[str] = mapped_column(Text, nullable=False)
    trace_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    synced_at: Mapped[str] = mapped_column(Text, server_default=_ts)
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)


class DiagnosisResult(Base):
    __tablename__ = "diagnosis_results"
    __table_args__ = (Index("idx_diagnosis_result_id", "result_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    result_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("benchmark_results.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    diagnosis_report: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("models.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[str] = mapped_column(Text, server_default=_ts)
