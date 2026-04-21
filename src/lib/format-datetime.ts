/**
 * UI 时间展示：统一用 {@link Intl.DateTimeFormat}，不传 `timeZone` 时使用运行环境默认时区
 *（浏览器内即用户本机本地时区）。
 */

function parseDate(
  input: string | number | Date | null | undefined,
): Date | null {
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type LocalDateTimeFormatOptions = Omit<
  Intl.DateTimeFormatOptions,
  'timeZone' | 'timeZoneName'
>;

/**
 * 日期 + 时间（本地时区），默认含年月日与时／分／秒。
 */
export function formatDateTimeLocal(
  input: string | number | Date | null | undefined,
  options?: LocalDateTimeFormatOptions,
): string {
  const d = parseDate(input);
  if (!d) return '';
  const fmt =
    options != null && Object.keys(options).length > 0
      ? new Intl.DateTimeFormat(undefined, options)
      : new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
  return fmt.format(d);
}

/**
 * 仅日期（本地时区）。
 */
export function formatDateLocal(
  input: string | number | Date | null | undefined,
  options?: LocalDateTimeFormatOptions,
): string {
  const d = parseDate(input);
  if (!d) return '';
  const fmt =
    options != null && Object.keys(options).length > 0
      ? new Intl.DateTimeFormat(undefined, options)
      : new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
  return fmt.format(d);
}
