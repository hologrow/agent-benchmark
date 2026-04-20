#!/usr/bin/env python3
"""
pytest 配置文件
"""

import sys
import os

# 添加 scripts 目录到 Python 路径
scripts_path = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if scripts_path not in sys.path:
    sys.path.insert(0, scripts_path)

# pytest 配置
def pytest_configure(config):
    """配置 pytest"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
