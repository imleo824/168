import type React from 'react';
import { AlertCircle, Image as ImageIcon, Plus } from 'lucide-react';

import ImageTile from './ImageUploadTile';
import type { FileSlot } from './imageUploadTypes';
import { cx } from './imageUploadUtils';

type ImageUploadDragHandlers = {
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
};

type ImageUploadButtonDragHandlers = {
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
};

type ImageUploadInputProps = {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  remainingCapacity: number;
  canAddMore: boolean;
  disabled: boolean;
  acceptedTypes: string;
  describedBy?: string;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

function ImageUploadInput({
  inputId,
  inputRef,
  remainingCapacity,
  canAddMore,
  disabled,
  acceptedTypes,
  describedBy,
  onFileChange,
}: ImageUploadInputProps) {
  return (
    <input
      id={inputId}
      ref={inputRef}
      type="file"
      multiple={remainingCapacity > 1}
      disabled={!canAddMore || disabled}
      className="sr-only"
      accept={acceptedTypes}
      onChange={onFileChange}
      aria-describedby={describedBy}
      tabIndex={-1}
    />
  );
}

type ImageUploadErrorProps = {
  id?: string;
  message: string | null;
  toolbar?: boolean;
};

function ImageUploadError({ id, message, toolbar = false }: ImageUploadErrorProps) {
  if (!message) return null;

  return (
    <div
      id={id}
      role="alert"
      className={cx('image-upload-global-error', toolbar && 'image-upload-toolbar-error')}
    >
      <AlertCircle className="image-upload-inline-error-icon" />
      <p className="x-caption">{message}</p>
    </div>
  );
}

type ToolbarImageUploadViewProps = {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  slots: FileSlot[];
  tileClassName: string;
  disabled: boolean;
  disabledReason: string;
  canAddMore: boolean;
  maxSlots: number;
  doneCount: number;
  isUploading: boolean;
  remainingCapacity: number;
  alwaysShowToolbarTrigger: boolean;
  showToolbarImageCount: boolean;
  toolbarSummary: string;
  acceptedTypes: string;
  describedBy?: string;
  errorId?: string;
  globalError: string | null;
  onPickClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (key: string) => void;
  buttonDragHandlers: ImageUploadButtonDragHandlers;
  gridDragHandlers: ImageUploadDragHandlers;
};

export function ToolbarImageUploadView({
  inputId,
  inputRef,
  slots,
  tileClassName,
  disabled,
  disabledReason,
  canAddMore,
  maxSlots,
  doneCount,
  isUploading,
  remainingCapacity,
  alwaysShowToolbarTrigger,
  showToolbarImageCount,
  toolbarSummary,
  acceptedTypes,
  describedBy,
  errorId,
  globalError,
  onPickClick,
  onFileChange,
  onRemove,
  buttonDragHandlers,
  gridDragHandlers,
}: ToolbarImageUploadViewProps) {
  const isToolbarDisabled = disabled || !canAddMore;
  const normalizedToolbarSummary = String(toolbarSummary || '').trim();
  const isToolbarActive = doneCount > 0;
  const toolbarCountText = isUploading
    ? '上传中'
    : showToolbarImageCount
      ? normalizedToolbarSummary || `${doneCount}/${maxSlots}`
      : '';

  return (
    <div className="image-upload image-upload--toolbar">
      {alwaysShowToolbarTrigger || canAddMore || disabled ? (
        <button
          type="button"
          onClick={onPickClick}
          className={cx(
            'image-upload-toolbar-trigger pressable',
            isToolbarActive && 'is-active',
            isToolbarDisabled && 'is-disabled',
          )}
          disabled={isToolbarDisabled}
          aria-label={disabled ? disabledReason : `上传图片，最多 ${maxSlots} 张`}
          title={isToolbarDisabled ? (disabled ? disabledReason : `最多可上传 ${maxSlots} 张`) : undefined}
          aria-describedby={describedBy}
          {...buttonDragHandlers}
        >
          <ImageIcon className="image-upload-toolbar-icon" aria-hidden="true" />
          {toolbarCountText ? (
            <span className="post-create-tool-summary image-upload-toolbar-count" aria-hidden="true">
              {toolbarCountText}
            </span>
          ) : null}
          <span className="sr-only">上传图片</span>
        </button>
      ) : null}

      {slots.length > 0 ? (
        <div className="image-upload-toolbar-preview-grid" {...gridDragHandlers}>
          {slots.map((slot, index) => (
            <ImageTile
              key={slot.key}
              slot={slot}
              index={index}
              onRemove={onRemove}
              tileClassName={tileClassName}
            />
          ))}
        </div>
      ) : null}

      <ImageUploadError id={errorId} message={globalError} toolbar />

      <ImageUploadInput
        inputId={inputId}
        inputRef={inputRef}
        remainingCapacity={remainingCapacity}
        canAddMore={canAddMore}
        disabled={disabled}
        acceptedTypes={acceptedTypes}
        describedBy={describedBy}
        onFileChange={onFileChange}
      />
    </div>
  );
}

type FieldImageUploadViewProps = {
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  slots: FileSlot[];
  label?: string;
  hint?: string;
  hintId?: string;
  errorId?: string;
  globalError: string | null;
  tileClassName: string;
  gridLayout: string;
  dragActive: boolean;
  canAddMore: boolean;
  disabled: boolean;
  maxSlots: number;
  remainingCapacity: number;
  acceptedTypes: string;
  describedBy?: string;
  onPickClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (key: string) => void;
  gridDragHandlers: ImageUploadDragHandlers;
};

export function FieldImageUploadView({
  inputId,
  inputRef,
  slots,
  label,
  hint,
  hintId,
  errorId,
  globalError,
  tileClassName,
  gridLayout,
  dragActive,
  canAddMore,
  disabled,
  maxSlots,
  remainingCapacity,
  acceptedTypes,
  describedBy,
  onPickClick,
  onFileChange,
  onRemove,
  gridDragHandlers,
}: FieldImageUploadViewProps) {
  return (
    <div className="image-upload image-upload--field">
      {label ? (
        <div>
          <label htmlFor={inputId} className="image-upload-label">
            {label}
          </label>
        </div>
      ) : null}

      {hint ? (
        <p id={hintId} className="image-upload-hint">
          {hint}
        </p>
      ) : null}

      <div className="image-upload-grid" data-grid-layout={gridLayout} {...gridDragHandlers}>
        {slots.map((slot, index) => (
          <ImageTile
            key={slot.key}
            slot={slot}
            index={index}
            onRemove={onRemove}
            tileClassName={tileClassName}
          />
        ))}

        {canAddMore ? (
          <button
            type="button"
            onClick={onPickClick}
            className={cx('image-upload-add pressable', tileClassName, dragActive && 'is-active')}
            aria-label={`上传图片，最多 ${maxSlots} 张`}
            aria-describedby={describedBy}
          >
            <Plus className="image-upload-add-icon" aria-hidden="true" />
            <span className="sr-only">上传图片</span>
          </button>
        ) : null}
      </div>

      <ImageUploadError id={errorId} message={globalError} />

      <ImageUploadInput
        inputId={inputId}
        inputRef={inputRef}
        remainingCapacity={remainingCapacity}
        canAddMore={canAddMore}
        disabled={disabled}
        acceptedTypes={acceptedTypes}
        describedBy={describedBy}
        onFileChange={onFileChange}
      />
    </div>
  );
}
