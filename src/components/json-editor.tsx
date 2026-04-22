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
 * Parse relaxed JSON / JS-like object literals.
 * Supports standard JSON, unquoted keys, single-quoted strings, stripped // and /* *\/ comments.
 */
function parseFlexibleJson(input: string): { success: boolean; value?: unknown; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: true, value: {} };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return { success: true, value: parsed };
  } catch {
    /* fall through */
  }

  try {
    let processed = trimmed
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    processed = processed.replace(/'([^'\\]|\\.)*'/g, (match) => {
      return '"' + match.slice(1, -1).replace(/\\'/g, "'") + '"';
    });

    processed = processed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

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
          Invalid format: {error}
        </p>
      )}
      {isValid && (
        <p className="text-xs text-green-600">
          Valid JSON
        </p>
      )}
    </div>
  );
}

export { parseFlexibleJson, formatJson };
