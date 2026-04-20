/**
 * Hermes Adapter
 * 执行Hermes类型的Agent
 *
 * 特点: Hermes特定命令行工具，可能有特殊的参数或环境要求
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AgentAdapter, ExecuteOptions, ExecuteResult, CommandAgentConfig } from './types';
import { parseAgentConfig, escapeShellPrompt, replaceCommandVariables } from './types';

const execAsync = promisify(exec);

// 超时时间: 10分钟
const EXECUTION_TIMEOUT = 10 * 60 * 1000;

export class HermesAdapter implements AgentAdapter {
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();

    try {
      // 解析配置
      const config = parseAgentConfig(options.agent) as CommandAgentConfig;

      // 验证配置
      if (!config.command) {
        throw new Error('Command is required for Hermes agent');
      }

      // 转义prompt
      const escapedPrompt = escapeShellPrompt(options.prompt);

      // 替换变量
      const command = replaceCommandVariables(config.command, {
        prompt: escapedPrompt,
        execution_id: options.executionId,
      });

      console.log(`[HermesAdapter] Executing command:`, command);
      console.log(`[HermesAdapter] Full prompt:`, options.prompt);

      // 执行命令
      const { stdout, stderr } = await execAsync(command, {
        timeout: EXECUTION_TIMEOUT,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        env: {
          ...process.env,
          // Hermes可能需要特定的环境变量
          FORCE_COLOR: '0',
          NON_INTERACTIVE: '1',
          HERMES_EXECUTION_ID: options.executionId,
        },
      });

      const executionTime = Date.now() - startTime;
      const output = stdout.trim() || stderr.trim();

      console.log(`[HermesAdapter] Execution completed in ${executionTime}ms`);
      console.log(`[HermesAdapter] Output preview:`, output.substring(0, 500) + (output.length > 500 ? '...' : ''));

      return {
        output,
        executionTime,
        command,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`[HermesAdapter] Execution failed after ${executionTime}ms:`, error);

      let errorMessage: string;

      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
          errorMessage = 'Hermes execution timed out (10 minutes limit)';
        } else if (error.message.includes('hermes')) {
          errorMessage = `Hermes execution failed: ${error.message}`;
        } else {
          errorMessage = `Execution failed: ${error.message}`;
        }
      } else {
        errorMessage = 'Unknown error during Hermes execution';
      }

      return {
        output: '',
        executionTime,
        error: errorMessage,
      };
    }
  }
}
