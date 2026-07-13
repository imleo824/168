import React, { useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';

import OptimizedImage from '@/ui/OptimizedImage';

import type { FileSlot, FileStatus } from './imageUploadTypes';
import { clampProgress, cx, isBusyStatus } from './imageUploadUtils';

const PROGRESS_RING_VIEW_BOX = '0 0 36 36';
const PROGRESS_RING_CENTER = 18;
const PROGRESS_RING_RADIUS = 15.5;
const PROGRESS_RING_PATH_LENGTH = 100;

function isLocalPreviewUrl(url: string) {
  return url.startsWith('blob:') || url.startsWith('data:');
}

function getStatusLabel(status: FileStatus) {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'compressing':
      return '处理中';
    case 'uploading':
      return '上传中';
    case 'done':
      return '已完成';
    case 'error':
      return '上传失败';
    default:
      return '处理中';
  }
}

const ProgressRing = React.memo(function ProgressRing({ pct }: { pct: number }) {
  const safePct = clampProgress(pct);
  const offset = PROGRESS_RING_PATH_LENGTH - safePct;

  return (
    <svg
      viewBox={PROGRESS_RING_VIEW_BOX}
      className="image-upload-progress-ring"
      role="progressbar"
      aria-label="上传进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safePct}
    >
      <circle
        cx={PROGRESS_RING_CENTER}
        cy={PROGRESS_RING_CENTER}
        r={PROGRESS_RING_RADIUS}
        pathLength={PROGRESS_RING_PATH_LENGTH}
        className="image-upload-progress-track"
      />
      <circle
        cx={PROGRESS_RING_CENTER}
        cy={PROGRESS_RING_CENTER}
        r={PROGRESS_RING_RADIUS}
        pathLength={PROGRESS_RING_PATH_LENGTH}
        strokeDasharray={PROGRESS_RING_PATH_LENGTH}
        strokeDashoffset={offset}
        className="image-upload-progress-value"
      />
    </svg>
  );
});

interface ImageTileProps {
  slot: FileSlot;
  index: number;
  onRemove: (key: string) => void;
  tileClassName?: string;
}

const ImageTile = React.memo(function ImageTile({
  slot,
  index,
  onRemove,
  tileClassName = 'image-upload-tile--square',
}: ImageTileProps) {
  const isBusy = isBusyStatus(slot.status);
  const safeProgress = clampProgress(slot.progress);
  const statusLabel = getStatusLabel(slot.status);
  const isLocalPreview = isLocalPreviewUrl(slot.previewUrl);

  const handleRemove = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      onRemove(slot.key);
    },
    [onRemove, slot.key],
  );

  return (
    <div
      className={cx('image-upload-tile surface-card', tileClassName)}
      aria-busy={isBusy || undefined}
    >
      <OptimizedImage
        src={slot.previewUrl}
        alt={slot.status === 'error' ? '上传失败的图片预览' : '上传图片预览'}
        className="image-upload-preview-image"
        draggable={false}
        loading={isLocalPreview ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="strict-origin-when-cross-origin"
        variant="medium"
        disableOptimization={isLocalPreview}
      />

      {isBusy ? (
        <div className="image-upload-busy-overlay">
          <ProgressRing pct={safeProgress} />
          <span className="image-upload-progress-label">
            {statusLabel}
            {slot.status === 'uploading' ? ` ${safeProgress}%` : ''}
          </span>
        </div>
      ) : null}

      {slot.status === 'error' ? (
        <div
          className="image-upload-error-overlay"
          title={slot.error || '上传失败'}
        >
          <AlertCircle className="image-upload-error-icon" />
          <span className="ui-upload-error-text image-upload-error-message">
            {slot.error || '上传失败'}
          </span>
        </div>
      ) : null}

      {(slot.status === 'done' || slot.status === 'error') ? (
        <button
          type="button"
          onClick={handleRemove}
          className="ui-image-remove-btn pressable"
          aria-label={`删除第 ${index + 1} 张图片`}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});

export default ImageTile;
