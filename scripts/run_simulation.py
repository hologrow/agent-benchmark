#!/usr/bin/env python3
"""
One-off agent run for 模拟跑.

Usage:
    python run_simulation.py <agent_id> "<prompt>"

Prompt is the third argv (UTF-8). Logs go to stderr; a single JSON object is
printed to stdout for the API to parse.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from output_parser import parse_agent_output
from run_benchmark import generate_magic_code, get_agent_details

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    if len(sys.argv) < 3:
        log("Usage: python run_simulation.py <agent_id> <prompt>")
        emit({"success": False, "error": "missing agent_id or prompt"})
        sys.exit(1)

    try:
        agent_id = int(sys.argv[1])
    except ValueError:
        emit({"success": False, "error": "invalid agent_id"})
        sys.exit(1)

    prompt = sys.argv[2]
    if not prompt.strip():
        emit({"success": False, "error": "empty prompt"})
        sys.exit(1)

    agent = get_agent_details(agent_id)
    if not agent:
        emit({"success": False, "error": f"agent {agent_id} not found"})
        sys.exit(1)

    magic_code = generate_magic_code()
    full_prompt = f"{prompt.rstrip()}\n\n[DEBUG: {magic_code}]"

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in agent["name"]
    )[:80]
    output_file = RESULTS_DIR / f"simulation_{safe_name}_{timestamp}.md"

    start = time.time()
    process = None
    run_started_at_str: str | None = None
    run_completed_at_str: str | None = None
    try:
        parts: list[bytes] = []
        agent_type = agent.get("agent_type", "other")
        config_json = agent.get("config_json", {})

        if agent_type == "openclaw":
            url = config_json.get("url", "")
            token = config_json.get("token", "")
            if not url or not token:
                raise ValueError("OpenClaw agent requires url and token in config_json")
            escaped_prompt = full_prompt.replace('"', '\\"').replace("$", "\\$")
            command_str = f'openclaw --url {url} --token {token} --prompt "{escaped_prompt}"'
            log(f"[run] openclaw --url {url} --token *** --prompt \"...\"")
        else:
            agent_command = config_json.get("command", agent["command"])
            if not agent_command:
                raise ValueError("Command is required for this agent type")
            command_str = agent_command.replace("{{prompt}}", full_prompt)
            timems = int(time.time() * 1000)
            command_str = command_str.replace(
                "{{execution_id}}", f"simulation-{timems}"
            )
            log(f"[run] {command_str}")

        # 二进制分块读取，避免子进程 stdout 全缓冲且无换行时 readline 死锁（管道写满后双方阻塞）
        run_started_at_str = utc_iso()
        process = subprocess.Popen(
            command_str,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            bufsize=0,
        )

        log_buf = b""
        deadline = start + 300.0
        assert process.stdout is not None

        with open(output_file, "wb") as f:
            while True:
                if time.time() > deadline:
                    process.kill()
                    raise subprocess.TimeoutExpired(command_str, timeout=300)

                chunk = process.stdout.read(8192)
                if chunk:
                    parts.append(chunk)
                    f.write(chunk)
                    f.flush()
                    log_buf += chunk
                    while b"\n" in log_buf:
                        raw_line, log_buf = log_buf.split(b"\n", 1)
                        log(raw_line.decode("utf-8", errors="replace").rstrip("\r"))
                else:
                    if process.poll() is not None:
                        break
                    time.sleep(0.05)

        if log_buf:
            log(log_buf.decode("utf-8", errors="replace").rstrip("\r"))

        run_completed_at_str = utc_iso()
        process.wait(timeout=30)
        elapsed_ms = int((time.time() - start) * 1000)
        actual_output = b"".join(parts).decode("utf-8", errors="replace")
        status = "completed" if process.returncode == 0 else "failed"
        parsed = parse_agent_output(actual_output)

        emit(
            {
                "success": True,
                "magic_code": magic_code,
                "status": status,
                "actual_output": actual_output,
                "execution_steps": parsed.get("execution_steps") or "",
                "execution_answer": parsed.get("execution_answer") or "",
                "execution_time_ms": elapsed_ms,
                "output_file": str(output_file),
                "return_code": process.returncode,
                "error": None,
                "run_started_at": run_started_at_str,
                "run_completed_at": run_completed_at_str,
            }
        )
    except subprocess.TimeoutExpired:
        if process:
            process.kill()
        elapsed_ms = int((time.time() - start) * 1000)
        if run_started_at_str and not run_completed_at_str:
            run_completed_at_str = utc_iso()
        partial = b"".join(parts).decode("utf-8", errors="replace")
        parsed_partial = parse_agent_output(partial)
        emit(
            {
                "success": True,
                "magic_code": magic_code,
                "status": "timeout",
                "actual_output": partial,
                "execution_steps": parsed_partial.get("execution_steps") or "",
                "execution_answer": parsed_partial.get("execution_answer") or "",
                "execution_time_ms": elapsed_ms,
                "output_file": str(output_file) if output_file.exists() else None,
                "return_code": None,
                "error": "Agent subprocess timed out",
                "run_started_at": run_started_at_str,
                "run_completed_at": run_completed_at_str,
            }
        )
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        if run_started_at_str and not run_completed_at_str:
            run_completed_at_str = utc_iso()
        err_body: dict = {
            "success": False,
            "magic_code": magic_code,
            "status": "error",
            "actual_output": "",
            "execution_steps": "",
            "execution_answer": "",
            "execution_time_ms": elapsed_ms,
            "output_file": None,
            "return_code": None,
            "error": str(e),
        }
        if run_started_at_str:
            err_body["run_started_at"] = run_started_at_str
        if run_completed_at_str:
            err_body["run_completed_at"] = run_completed_at_str
        emit(err_body)
        sys.exit(1)


if __name__ == "__main__":
    main()
