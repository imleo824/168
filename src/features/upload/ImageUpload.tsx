import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import '@/styles/system/ui-primitives-upload.css';
import {
  ACCEPTED_IMAGE_TYPES,
  getImageValidationError,
  normalizeImageUploadError,
  prepareImageForUpload,
  uploadPreparedImage,
} from './imageUploadPipeline';
import { FieldImageUploadView, ToolbarImageUploadView } from './ImageUploadViews';
import {
  CONCURRENCY,
  DEFAULT_MAX_COUNT,
  PROGRESS_UPDATE_STEP,
  type FileSlot,
  type ImageUploadProps,
  type UploadJob,
} from './imageUploadTypes';
import {
  areStringArraysEqual,
  buildDoneSlots,
  clampProgress,
  countQuotaSlots,
  createUploadKey,
  getDoneUrls,
  getFileFingerprint,
  hasBusySlots,
  hasDraggedFiles,
  hasSlotPatchChanges,
  isQuotaStatus,
  makeUrlKey,
  normalizeMaxCount,
  normalizeUrlList,
  useLatestRef,
} from './imageUploadUtils';

function ImageUpload({
  onImagesChange,
  onUploadingChange,
  maxCount = DEFAULT_MAX_COUNT,
  defaultImages = [],
  label,
  hint,
  tileClassName = 'image-upload-tile--square',
  purpose = 'post',
  layout = 'grid',
  disabled = false,
  disabledReason = '暂不可上传图片',
  alwaysShowToolbarTrigger = false,
  showToolbarImageCount = false,
  toolbarSummary = '',
}: ImageUploadProps) {
  const inputId = useId();
  const normalizedDefaultImages = useMemo(() => normalizeUrlList(defaultImages), [defaultImages]);
  const defaultImagesKey = useMemo(() => makeUrlKey(normalizedDefaultImages), [normalizedDefaultImages]);

  const [slots, setSlots] = useState<FileSlot[]>(() => buildDoneSlots(normalizedDefaultImages));
  const [dragActive, setDragActive] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const slotsRef = useRef<FileSlot[]>(slots);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const activeUploadsRef = useRef<Set<XMLHttpRequest>>(new Set());
  const uploadQueueRef = useRef<UploadJob[]>([]);
  const runningUploadsRef = useRef(0);
  const dragDepthRef = useRef(0);
  const progressCacheRef = useRef<Map<string, number>>(new Map());
  const drainQueueRef = useRef<(() => void) | null>(null);
  const lastDoneUrlsKeyRef = useRef(makeUrlKey(getDoneUrls(slots)));
  const lastUploadingRef = useRef<boolean | null>(null);
  const lastAppliedDefaultImagesKeyRef = useRef(defaultImagesKey);
  const lastEmittedImagesKeyRef = useRef(defaultImagesKey);

  const onImagesChangeRef = useLatestRef(onImagesChange);
  const onUploadingChangeRef = useLatestRef(onUploadingChange);

  const maxSlots = useMemo(() => normalizeMaxCount(maxCount), [maxCount]);
  const doneUrls = useMemo(() => getDoneUrls(slots), [slots]);
  const doneUrlsKey = useMemo(() => makeUrlKey(doneUrls), [doneUrls]);

  const { remainingCapacity, canAddMore, isUploading, doneCount } = useMemo(() => {
    const quotaCount = countQuotaSlots(slots);
    const doneCount = getDoneUrls(slots).length;
    const remaining = Math.max(0, maxSlots - quotaCount);

    return {
      remainingCapacity: remaining,
      canAddMore: !disabled && remaining > 0,
      doneCount,
      isUploading: hasBusySlots(slots),
    };
  }, [disabled, maxSlots, slots]);

  const totalTiles = slots.length + (canAddMore ? 1 : 0);
  const acceptedTypes = useMemo(() => ACCEPTED_IMAGE_TYPES.join(','), []);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = globalError ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const gridLayout = maxSlots === 1
    ? 'single'
    : totalTiles <= 3
      ? 'compact'
      : 'dense';

  const commitSlots = useCallback((updater: (current: FileSlot[]) => FileSlot[]) => {
    if (!mountedRef.current) return;

    const current = slotsRef.current;
    const next = updater(current);

    if (next === current) return;

    slotsRef.current = next;
    setSlots(next);
  }, []);

  const setGlobalErrorSafely = useCallback((message: string | null) => {
    if (mountedRef.current) setGlobalError(message);
  }, []);

  const createPreviewUrl = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const revokePreviewUrl = useCallback((url?: string) => {
    if (!url?.startsWith('blob:')) return;
    if (!objectUrlsRef.current.has(url)) return;

    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const revokeSlotPreviewUrls = useCallback(
    (items: readonly FileSlot[]) => {
      for (const slot of items) revokePreviewUrl(slot.previewUrl);
    },
    [revokePreviewUrl],
  );

  const registerUploadRequest = useCallback((xhr: XMLHttpRequest) => {
    if (!mountedRef.current) {
      xhr.abort();
      return undefined;
    }

    activeUploadsRef.current.add(xhr);

    return () => {
      activeUploadsRef.current.delete(xhr);
    };
  }, []);

  const slotExists = useCallback((key: string) => {
    return slotsRef.current.some((slot) => slot.key === key);
  }, []);

  const patchSlot = useCallback(
    (key: string, patch: Partial<FileSlot>) => {
      commitSlots((current) => {
        let changed = false;
        const next = current.map((slot) => {
          if (slot.key !== key) return slot;
          if (!hasSlotPatchChanges(slot, patch)) return slot;
          changed = true;
          return { ...slot, ...patch };
        });

        return changed ? next : current;
      });
    },
    [commitSlots],
  );

  const patchProgress = useCallback(
    (key: string, pct: number) => {
      const safePct = clampProgress(pct);
      const lastPct = progressCacheRef.current.get(key);

      if (
        lastPct !== undefined
        && safePct !== 100
        && Math.abs(safePct - lastPct) < PROGRESS_UPDATE_STEP
      ) {
        return;
      }

      progressCacheRef.current.set(key, safePct);
      patchSlot(key, { progress: safePct });
    },
    [patchSlot],
  );

  const processUploadJob = useCallback(
    async (job: UploadJob) => {
      if (!mountedRef.current || !slotExists(job.key)) {
        revokePreviewUrl(job.previewUrl);
        return;
      }

      patchSlot(job.key, { status: 'compressing', progress: 8, error: undefined });

      let prepared: Awaited<ReturnType<typeof prepareImageForUpload>>;

      try {
        prepared = await prepareImageForUpload(job.file, purpose);
      } catch (err) {
        if (!mountedRef.current) return;
        progressCacheRef.current.delete(job.key);
        patchSlot(job.key, {
          status: 'error',
          error: normalizeImageUploadError(err),
          progress: 0,
        });
        return;
      }

      if (!mountedRef.current || !slotExists(job.key)) {
        revokePreviewUrl(job.previewUrl);
        return;
      }

      patchSlot(job.key, { status: 'uploading', progress: 0, error: undefined });

      try {
        const uploadedUrl = await uploadPreparedImage(prepared, {
          onProgress: (pct) => patchProgress(job.key, pct),
          registerRequest: registerUploadRequest,
        });

        if (!mountedRef.current) return;

        if (!slotExists(job.key)) {
          revokePreviewUrl(job.previewUrl);
          return;
        }

        progressCacheRef.current.delete(job.key);
        patchSlot(job.key, {
          status: 'done',
          progress: 100,
          uploadedUrl,
          error: undefined,
          sourceFingerprint: job.fingerprint,
        });
      } catch (err) {
        if (!mountedRef.current) return;
        progressCacheRef.current.delete(job.key);
        patchSlot(job.key, {
          status: 'error',
          error: normalizeImageUploadError(err),
          progress: 0,
        });
      }
    },
    [patchProgress, patchSlot, purpose, registerUploadRequest, revokePreviewUrl, slotExists],
  );

  const drainUploadQueue = useCallback(() => {
    if (!mountedRef.current) return;

    while (runningUploadsRef.current < CONCURRENCY && uploadQueueRef.current.length > 0) {
      const job = uploadQueueRef.current.shift();
      if (!job) return;

      runningUploadsRef.current += 1;
      void processUploadJob(job).finally(() => {
        runningUploadsRef.current = Math.max(0, runningUploadsRef.current - 1);
        drainQueueRef.current?.();
      });
    }
  }, [processUploadJob]);

  useEffect(() => {
    drainQueueRef.current = drainUploadQueue;
  }, [drainUploadQueue]);

  useEffect(() => {
    if (defaultImagesKey === lastAppliedDefaultImagesKeyRef.current) return;

    if (defaultImagesKey === lastEmittedImagesKeyRef.current) {
      lastAppliedDefaultImagesKeyRef.current = defaultImagesKey;
      return;
    }

    if (isUploading || hasBusySlots(slotsRef.current)) return;

    commitSlots((current) => {
      const currentDoneKey = makeUrlKey(getDoneUrls(current));
      const hasNonDoneSlot = current.some((slot) => slot.status !== 'done');

      if (!hasNonDoneSlot && currentDoneKey === defaultImagesKey) return current;

      revokeSlotPreviewUrls(current);
      progressCacheRef.current.clear();
      return buildDoneSlots(normalizedDefaultImages);
    });

    lastAppliedDefaultImagesKeyRef.current = defaultImagesKey;
  }, [commitSlots, defaultImagesKey, isUploading, normalizedDefaultImages, revokeSlotPreviewUrls]);

  useEffect(() => {
    if (doneUrlsKey === lastDoneUrlsKeyRef.current) return;

    lastDoneUrlsKeyRef.current = doneUrlsKey;
    lastEmittedImagesKeyRef.current = doneUrlsKey;
    lastAppliedDefaultImagesKeyRef.current = doneUrlsKey;
    onImagesChangeRef.current(doneUrls);
  }, [doneUrls, doneUrlsKey, onImagesChangeRef]);

  useEffect(() => {
    if (lastUploadingRef.current === isUploading) return;

    lastUploadingRef.current = isUploading;
    onUploadingChangeRef.current?.(isUploading);
  }, [isUploading, onUploadingChangeRef]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      uploadQueueRef.current = [];
      runningUploadsRef.current = 0;
      dragDepthRef.current = 0;
      progressCacheRef.current.clear();

      activeUploadsRef.current.forEach((xhr) => {
        try {
          xhr.abort();
        } catch {
          // Ignore abort errors.
        }
      });
      activeUploadsRef.current.clear();

      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();

      onUploadingChangeRef.current?.(false);
    };
  }, [onUploadingChangeRef]);

  const processFiles = useCallback(
    (rawFiles: File[]) => {
      if (disabled) {
        setGlobalErrorSafely(disabledReason);
        return;
      }

      const files = Array.isArray(rawFiles) ? rawFiles : [];

      if (!files.length) {
        setGlobalErrorSafely(null);
        return;
      }

      const capacity = Math.max(0, maxSlots - countQuotaSlots(slotsRef.current));

      if (capacity <= 0) {
        setGlobalErrorSafely(`最多可上传 ${maxSlots} 张图片`);
        return;
      }

      const validationErrors = new Set<string>();
      const selectedFingerprints = new Set<string>();
      const existingFingerprints = new Set(
        slotsRef.current
          .filter((slot) => slot.sourceFingerprint && isQuotaStatus(slot.status))
          .map((slot) => slot.sourceFingerprint!),
      );

      const jobs: UploadJob[] = [];
      const newSlots: FileSlot[] = [];
      let skippedByLimit = 0;
      let skippedDuplicate = 0;

      for (const file of files) {
        const validationError = getImageValidationError(file, purpose);

        if (validationError) {
          validationErrors.add(validationError);
          continue;
        }

        const fingerprint = getFileFingerprint(file);

        if (selectedFingerprints.has(fingerprint) || existingFingerprints.has(fingerprint)) {
          skippedDuplicate += 1;
          continue;
        }

        if (newSlots.length >= capacity) {
          skippedByLimit += 1;
          continue;
        }

        selectedFingerprints.add(fingerprint);

        const key = createUploadKey(file);
        const previewUrl = createPreviewUrl(file);

        newSlots.push({
          key,
          previewUrl,
          status: 'pending',
          progress: 0,
          sourceFingerprint: fingerprint,
        });

        jobs.push({ key, file, previewUrl, fingerprint });
      }

      const errors = Array.from(validationErrors);

      if (skippedDuplicate > 0) errors.push(`已忽略 ${skippedDuplicate} 张重复图片`);
      if (skippedByLimit > 0) errors.push(`最多可上传 ${maxSlots} 张图片，已忽略 ${skippedByLimit} 张`);

      setGlobalErrorSafely(errors.length ? errors.join(' · ') : null);

      if (!newSlots.length) return;

      commitSlots((current) => [...current, ...newSlots]);
      uploadQueueRef.current.push(...jobs);
      drainUploadQueue();
    },
    [commitSlots, createPreviewUrl, disabled, disabledReason, drainUploadQueue, maxSlots, purpose, setGlobalErrorSafely],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      processFiles(files);
      event.currentTarget.value = '';
    },
    [processFiles],
  );

  const handlePickClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (disabled) {
        setGlobalErrorSafely(disabledReason);
        return;
      }

      if (!canAddMore) {
        setGlobalErrorSafely(`最多可上传 ${maxSlots} 张图片`);
        return;
      }

      fileInputRef.current?.click();
    },
    [canAddMore, disabled, disabledReason, maxSlots, setGlobalErrorSafely],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;

      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      dragDepthRef.current += 1;

      if (canAddMore) setDragActive(true);
    },
    [canAddMore, disabled],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = canAddMore && !disabled ? 'copy' : 'none';

      if (canAddMore && !disabled) setDragActive(true);
    },
    [canAddMore, disabled],
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setDragActive(false);

      if (disabled) {
        setGlobalErrorSafely(disabledReason);
        return;
      }

      const files = Array.from(event.dataTransfer.files ?? []);

      if (!files.length) {
        setGlobalErrorSafely('请拖入图片文件');
        return;
      }

      processFiles(files);
    },
    [disabled, disabledReason, processFiles, setGlobalErrorSafely],
  );

  const handleRemove = useCallback(
    (key: string) => {
      let removedSlot: FileSlot | undefined;

      uploadQueueRef.current = uploadQueueRef.current.filter((job) => job.key !== key);

      commitSlots((current) => {
        const next = current.filter((slot) => {
          if (slot.key === key) {
            removedSlot = slot;
            return false;
          }

          return true;
        });

        return removedSlot ? next : current;
      });

      if (!removedSlot) return;

      revokePreviewUrl(removedSlot.previewUrl);
      progressCacheRef.current.delete(key);

      if (removedSlot.status === 'error') setGlobalErrorSafely(null);
    },
    [commitSlots, revokePreviewUrl, setGlobalErrorSafely],
  );

  if (layout === 'toolbar') {
    return (
      <ToolbarImageUploadView
        inputId={inputId}
        inputRef={fileInputRef}
        slots={slots}
        tileClassName={tileClassName}
        disabled={disabled}
        disabledReason={disabledReason}
        canAddMore={canAddMore}
        maxSlots={maxSlots}
        doneCount={doneCount}
        isUploading={isUploading}
        remainingCapacity={remainingCapacity}
        alwaysShowToolbarTrigger={alwaysShowToolbarTrigger}
        showToolbarImageCount={showToolbarImageCount}
        toolbarSummary={toolbarSummary}
        acceptedTypes={acceptedTypes}
        describedBy={describedBy}
        errorId={errorId}
        globalError={globalError}
        onPickClick={handlePickClick}
        onFileChange={handleFileChange}
        onRemove={handleRemove}
        buttonDragHandlers={{
          onDragEnter: handleDragEnter,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        }}
        gridDragHandlers={{
          onDragEnter: handleDragEnter,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        }}
        />
    );
  }

  return (
    <FieldImageUploadView
      inputId={inputId}
      inputRef={fileInputRef}
      slots={slots}
      label={label}
      hint={hint}
      hintId={hintId}
      errorId={errorId}
      globalError={globalError}
      tileClassName={tileClassName}
      gridLayout={gridLayout}
      dragActive={dragActive}
      canAddMore={canAddMore}
      disabled={disabled}
      maxSlots={maxSlots}
      remainingCapacity={remainingCapacity}
      acceptedTypes={acceptedTypes}
      describedBy={describedBy}
      onPickClick={handlePickClick}
      onFileChange={handleFileChange}
      onRemove={handleRemove}
      gridDragHandlers={{
        onDragEnter: handleDragEnter,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      }}
    />
  );
}

function areImageUploadPropsEqual(
  prevProps: Readonly<ImageUploadProps>,
  nextProps: Readonly<ImageUploadProps>,
) {
  return (
    prevProps.onImagesChange === nextProps.onImagesChange
    && prevProps.onUploadingChange === nextProps.onUploadingChange
    && prevProps.maxCount === nextProps.maxCount
    && prevProps.label === nextProps.label
    && prevProps.hint === nextProps.hint
    && prevProps.tileClassName === nextProps.tileClassName
    && prevProps.purpose === nextProps.purpose
    && prevProps.layout === nextProps.layout
    && prevProps.disabled === nextProps.disabled
    && prevProps.disabledReason === nextProps.disabledReason
    && prevProps.alwaysShowToolbarTrigger === nextProps.alwaysShowToolbarTrigger
    && prevProps.showToolbarImageCount === nextProps.showToolbarImageCount
    && prevProps.toolbarSummary === nextProps.toolbarSummary
    && areStringArraysEqual(prevProps.defaultImages, nextProps.defaultImages)
  );
}

export default React.memo(ImageUpload, areImageUploadPropsEqual);
