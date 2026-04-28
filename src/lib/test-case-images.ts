/** data URL 或 http(s) 图片，用于测试用例 `images_json` 展示 */
export function parseTestCaseImageUrls(
  imagesJson: string | null | undefined,
): string[] {
  if (imagesJson == null || imagesJson === "") return [];
  try {
    const parsed = JSON.parse(imagesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is string =>
        typeof x === "string" &&
        (x.startsWith("data:image/") ||
          /^https?:\/\//i.test(x) ||
          x.startsWith("/")),
    );
  } catch {
    return [];
  }
}

export const TEST_CASE_IMAGE_MAX_COUNT = 10;
export const TEST_CASE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("仅支持图片文件"));
      return;
    }
    if (file.size > TEST_CASE_IMAGE_MAX_BYTES) {
      reject(
        new Error(
          `单张图片不超过 ${Math.floor(TEST_CASE_IMAGE_MAX_BYTES / 1024 / 1024)}MB`,
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") resolve(r);
      else reject(new Error("读取失败"));
    };
    reader.onerror = () => reject(new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}
