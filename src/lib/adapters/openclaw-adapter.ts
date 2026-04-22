/**
 * OpenClaw CLI adapter — `openclaw --url … --token … --prompt "…"`.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AgentAdapter, ExecuteOptions, ExecuteResult, OpenClawConfig } from './types';
import { parseAgentConfig, escapeShellPrompt } from './types';

const execAsync = promisify(exec);

// 10 minute timeout
const EXECUTION_TIMEOUT = 10 * 60 * 1000;

export class OpenClawAdapter implements AgentAdapter {
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();

    try {
      const config = parseAgentConfig(options.agent) as OpenClawConfig;

      if (!config.url) {
        throw new Error('OpenClaw URL is required');
      }
      if (!config.token) {
        throw new Error('OpenClaw token is required');
      }

      const escapedPrompt = escapeShellPrompt(options.prompt);

      const command = `openclaw --url ${config.url} --token ${config.token} --prompt "${escapedPrompt}"`;

      console.log(`[OpenClawAdapter] Executing command:`, command.replace(config.token, '***'));

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

      console.log(`[OpenClawAdapter] Execution completed in ${executionTime}ms`);
      console.log(`[OpenClawAdapter] Output preview:`, output.substring(0, 500) + (output.length > 500 ? '...' : ''));

      return {
        output,
        executionTime,
        command: command.replace(config.token, '***'),
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`[OpenClawAdapter] Execution failed after ${executionTime}ms:`, error);

      let errorMessage: string;

      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
          errorMessage = 'OpenClaw execution timed out (10 minutes limit)';
        } else {
          errorMessage = `OpenClaw execution failed: ${error.message}`;
        }
      } else {
        errorMessage = 'Unknown error during OpenClaw execution';
      }

      return {
        output: '',
        executionTime,
        error: errorMessage,
      };
    }
  }
}
