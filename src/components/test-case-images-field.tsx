"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TEST_CASE_IMAGE_MAX_BYTES,
  TEST_CASE_IMAGE_MAX_COUNT,
  fileToDataUrl,
  parseTestCaseImageUrls,
} from "@/lib/test-case-images";
import { toast } from "sonner";

function TestCaseImagesLightbox({
  urls,
  activeIndex,
  onClose,
  onNavigate,
}: {
  urls: string[];
  activeIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const open =
    activeIndex !== null &&
    activeIndex >= 0 &&
    activeIndex < urls.length &&
    urls.length > 0;
  const idx = activeIndex ?? 0;
  const url = open ? urls[idx] : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton
        className="max-h-[95vh] max-w-[min(96vw,1400px)] gap-0 border-0 bg-transparent p-2 shadow-none ring-0 sm:max-w-[min(96vw,1400px)]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          图片预览 {open ? `${idx + 1} / ${urls.length}` : ""}
        </DialogTitle>
        {open ? (
          <div className="relative flex min-h-0 flex-col items-center justify-center rounded-lg bg-black/90 p-2">
            <div className="relative flex max-h-[85vh] w-full items-center justify-center">
              {urls.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-1 z-10 h-9 w-9 shrink-0 rounded-full bg-background/90 shadow-md"
                  onClick={() =>
                    onNavigate((idx - 1 + urls.length) % urls.length)
                  }
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL / 外链 */}
              <img
                src={url}
                alt=""
                className="max-h-[85vh] max-w-full object-contain"
              />
              {urls.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-1 z-10 h-9 w-9 shrink-0 rounded-full bg-background/90 shadow-md"
                  onClick={() => onNavigate((idx + 1) % urls.length)}
                  aria-label="下一张"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              ) : null}
            </div>
            {urls.length > 1 ? (
              <p className="text-muted-foreground mt-2 text-center text-xs text-white/70">
                {idx + 1} / {urls.length}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type TestCaseImagesFieldProps = {
  label?: string;
  description?: string;
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  className?: string;
};

export function TestCaseImagesField({
  label = "附图（可选）",
  description = "拖拽、点击选择或粘贴截图；最多 " +
    String(TEST_CASE_IMAGE_MAX_COUNT) +
    " 张，单张不超过 " +
    String(Math.floor(TEST_CASE_IMAGE_MAX_BYTES / 1024 / 1024)) +
    "MB。",
  value,
  onChange,
  disabled,
  className,
}: TestCaseImagesFieldProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      const room = TEST_CASE_IMAGE_MAX_COUNT - value.length;
      if (room <= 0) {
        toast.error(`最多 ${String(TEST_CASE_IMAGE_MAX_COUNT)} 张图片`);
        return;
      }
      const take = list.slice(0, room);
      const next: string[] = [...value];
      for (const file of take) {
        try {
          next.push(await fileToDataUrl(file));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "添加图片失败");
        }
      }
      onChange(next);
    },
    [value, onChange],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        e.preventDefault();
        void addFiles(items);
      }
    },
    [addFiles, disabled],
  );

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("space-y-2", className)} onPaste={onPaste}>
      <TestCaseImagesLightbox
        urls={value}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <span className="text-muted-foreground text-xs">{value.length} 张</span>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>

      <div
        className={cn(
          "rounded-md border border-dashed p-3 transition-colors",
          disabled && "pointer-events-none opacity-50",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          if (disabled) return;
          void addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(ev) => {
            const f = ev.target.files;
            if (f?.length) void addFiles(f);
            ev.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || value.length >= TEST_CASE_IMAGE_MAX_COUNT}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="mr-1 h-4 w-4" />
            选择图片
          </Button>
        </div>

        {value.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {value.map((url, i) => (
              <li
                key={`${String(i)}-${url.slice(0, 40)}`}
                className="group relative"
              >
                <button
                  type="button"
                  disabled={disabled}
                  className="border-border focus-visible:ring-ring block cursor-zoom-in rounded-md border outline-none focus-visible:ring-2 disabled:pointer-events-none"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`放大预览第 ${i + 1} 张`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URLs from user */}
                  <img
                    src={url}
                    alt=""
                    className="border-border h-20 w-20 rounded-md border object-cover"
                  />
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute -right-1 -top-1 z-10 h-6 w-6 rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  disabled={disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  aria-label="移除图片"
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function TestCaseImagePreviews({
  imagesJson,
  className,
  maxThumbs = 4,
}: {
  imagesJson: string | null | undefined;
  className?: string;
  /** 列表里最多展示几张缩略图 */
  maxThumbs?: number;
}) {
  const urls = parseTestCaseImageUrls(imagesJson);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (urls.length === 0) {
    return (
      <span className={cn("text-muted-foreground text-xs", className)}>—</span>
    );
  }
  const shown = urls.slice(0, maxThumbs);
  const more = urls.length - shown.length;
  return (
    <>
      <TestCaseImagesLightbox
        urls={urls}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
      <div className={cn("flex flex-wrap items-center gap-1", className)}>
        {shown.map((url, i) => (
          <button
            key={`${String(i)}-${url.slice(0, 32)}`}
            type="button"
            className="border-border focus-visible:ring-ring cursor-zoom-in rounded border outline-none focus-visible:ring-2"
            onClick={() => setLightboxIndex(i)}
            aria-label={`放大预览第 ${i + 1} 张`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL / 外链 */}
            <img
              src={url}
              alt=""
              className="border-border h-10 w-10 rounded border object-cover"
            />
          </button>
        ))}
        {more > 0 ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            onClick={() => setLightboxIndex(maxThumbs)}
            aria-label={`还有 ${more} 张，点击查看`}
          >
            +{more}
          </button>
        ) : null}
      </div>
    </>
  );
}
