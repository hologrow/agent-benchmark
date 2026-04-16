'use client';

import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface JsonEditorProps {
  value: string;
  onChange: (value: string, isValid: boolean, parsedValue?: unknown) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

/**
 * 解析 JavaScript 风格的对象或 JSON 字符串
 * 支持:
 * - 标准 JSON: {"key": "value"}
 * - JavaScript 对象: {key: "value", num: 123, bool: true}
 * - 带注释的 JSON (会被移除)
 */
function parseFlexibleJson(input: string): { success: boolean; value?: unknown; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: true, value: {} };
  }

  // 尝试作为标准 JSON 解析
  try {
    const parsed = JSON.parse(trimmed);
    return { success: true, value: parsed };
  } catch {
    // 继续尝试其他格式
  }

  // 尝试作为 JavaScript 对象解析
  // 1. 将单引号替换为双引号
  // 2. 给无引号的键添加双引号
  // 3. 移除注释
  try {
    // 移除单行注释 // 和多行注释 /* */
    let processed = trimmed
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // 将单引号字符串替换为双引号
    // 这是一个简化的处理，可能不覆盖所有 edge cases
    processed = processed.replace(/'([^'\\]|\\.)*'/g, (match) => {
      return '"' + match.slice(1, -1).replace(/\\'/g, "'") + '"';
    });

    // 给对象键添加引号 (处理 {key: value} -> {"key": value})
    processed = processed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

    // 处理尾部逗号
    processed = processed.replace(/,(\s*[}\]])/g, '$1');

    const parsed = JSON.parse(processed);
    return { success: true, value: parsed };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Invalid JSON or JavaScript object'
    };
  }
}

/**
 * 格式化值为 JSON 字符串
 */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function JsonEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '300px'
}: JsonEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  // 当外部 value 变化时更新本地值
  useEffect(() => {
    setLocalValue(value);
    const result = parseFlexibleJson(value);
    setIsValid(result.success);
    if (!result.success) {
      setError(result.error || 'Invalid format');
    } else {
      setError(null);
    }
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    const result = parseFlexibleJson(newValue);

    if (result.success) {
      setError(null);
      setIsValid(true);
      // 如果解析成功，返回格式化的 JSON
      const formatted = formatJson(result.value);
      onChange(formatted, true, result.value);
    } else {
      setError(result.error || 'Invalid format');
      setIsValid(false);
      onChange(newValue, false);
    }
  };

  const handleBlur = () => {
    const result = parseFlexibleJson(localValue);
    if (result.success) {
      // 失去焦点时，如果有效则格式化为标准 JSON
      const formatted = formatJson(result.value);
      setLocalValue(formatted);
      setError(null);
      setIsValid(true);
      onChange(formatted, true, result.value);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          'font-mono text-sm resize-y',
          !isValid && 'border-red-500 focus-visible:ring-red-500',
          className
        )}
        style={{ minHeight }}
      />
      {error && (
        <p className="text-sm text-red-500">
          格式错误: {error}
        </p>
      )}
      {isValid && (
        <p className="text-xs text-green-600">
          格式有效
        </p>
      )}
    </div>
  );
}

export { parseFlexibleJson, formatJson };
