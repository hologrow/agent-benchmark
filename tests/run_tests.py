#!/usr/bin/env python3
"""
测试运行脚本
运行所有测试或指定测试
"""

import sys
import os
import argparse
import unittest

# 添加测试目录到路径
sys.path.insert(0, os.path.dirname(__file__))


def run_all_tests():
    """运行所有测试"""
    loader = unittest.TestLoader()
    start_dir = os.path.dirname(__file__)
    suite = loader.discover(start_dir, pattern='test_*.py')

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return 0 if result.wasSuccessful() else 1


def run_specific_test(test_name):
    """运行指定测试"""
    loader = unittest.TestLoader()
    start_dir = os.path.dirname(__file__)

    if '.' in test_name:
        # 运行特定测试类或方法: test_module.TestClass.test_method
        suite = loader.loadTestsFromName(test_name)
    else:
        # 运行特定测试模块
        suite = loader.loadTestsFromName(test_name)

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return 0 if result.wasSuccessful() else 1


def run_with_coverage():
    """运行测试并生成覆盖率报告"""
    try:
        import coverage
        cov = coverage.Coverage(
            source=[os.path.join(os.path.dirname(__file__), '..', 'scripts')],
            omit=['*/tests/*', '*/venv/*', '*/.venv/*']
        )
        cov.start()

        result = run_all_tests()

        cov.stop()
        cov.save()

        print("\n" + "="*80)
        print("覆盖率报告")
        print("="*80)
        cov.report()

        # 生成 HTML 报告
        html_dir = os.path.join(os.path.dirname(__file__), '..', 'coverage_html')
        cov.html_report(directory=html_dir)
        print(f"\nHTML 覆盖率报告已生成: {html_dir}")

        return result
    except ImportError:
        print("警告: 未安装 coverage 包，运行测试但不生成覆盖率报告")
        print("安装: pip install coverage")
        return run_all_tests()


def main():
    parser = argparse.ArgumentParser(description='运行 benchmark 项目测试')
    parser.add_argument(
        'test',
        nargs='?',
        help='指定要运行的测试 (例如: test_output_parser 或 test_output_parser.TestParseAgentOutput)'
    )
    parser.add_argument(
        '--coverage', '-c',
        action='store_true',
        help='生成覆盖率报告'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='详细输出'
    )

    args = parser.parse_args()

    if args.coverage:
        return run_with_coverage()
    elif args.test:
        return run_specific_test(args.test)
    else:
        return run_all_tests()


if __name__ == '__main__':
    sys.exit(main())
