/**
 * Other Adapter
 * 执行通用命令行Agent (默认适配器)
 *
 * 特点: 支持任何命令行工具，通过{{prompt}}和{{execution_id}}变量注入参数
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AgentAdapter, ExecuteOptions, ExecuteResult, CommandAgentConfig } from './types';
import { parseAgentConfig, escapeShellPrompt, replaceCommandVariables } from './types';

const execAsync = promisify(exec);

// 超时时间: 10分钟
const EXECUTION_TIMEOUT = 10 * 60 * 1000;

export class OtherAdapter implements AgentAdapter {
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();

    try {
      // 解析配置
      const config = parseAgentConfig(options.agent) as CommandAgentConfig;

      // 验证配置
      if (!config.command) {
        throw new Error('Command is required');
      }

      // 转义prompt
      const escapedPrompt = escapeShellPrompt(options.prompt);

      // 替换变量
      const command = replaceCommandVariables(config.command, {
        prompt: escapedPrompt,
        execution_id: options.executionId,
      });

      console.log(`[OtherAdapter] Executing command:`, command);
      console.log(`[OtherAdapter] Full prompt:`, options.prompt);

      // 执行命令
      const { stdout, stderr } = await execAsync(command, {
        timeout: EXECUTION_TIMEOUT,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NON_INTERACTIVE: '1',
        },
      });

      const executionTime = Date.now() - startTime;
      const output = stdout.trim() || stderr.trim();

      console.log(`[OtherAdapter] Execution completed in ${executionTime}ms`);
      console.log(`[OtherAdapter] Output preview:`, output.substring(0, 500) + (output.length > 500 ? '...' : ''));

      return {
        output,
        executionTime,
        command,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`[OtherAdapter] Execution failed after ${executionTime}ms:`, error);

      let errorMessage: string;

      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
          errorMessage = 'Agent execution timed out (10 minutes limit)';
        } else {
          errorMessage = `Agent execution failed: ${error.message}`;
        }
      } else {
        errorMessage = 'Unknown error during agent execution';
      }

      return {
        output: '',
        executionTime,
        error: errorMessage,
      };
    }
  }
}
