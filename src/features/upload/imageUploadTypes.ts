import type { ImageUploadPurpose } from './imageUploadConfig';

export const DEFAULT_MAX_COUNT = 4;
export const CONCURRENCY = 2;
export const PROGRESS_UPDATE_STEP = 6;

export type FileStatus = 'pending' | 'compressing' | 'uploading' | 'done' | 'error';

export interface FileSlot {
  key: string;
  previewUrl: string;
  status: FileStatus;
  progress: number;
  uploadedUrl?: string;
  error?: string;
  sourceFingerprint?: string;
}

export interface UploadJob {
  key: string;
  file: File;
  previewUrl: string;
  fingerprint: string;
}

export interface ImageUploadProps {
  onImagesChange: (urls: string[]) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  maxCount?: number;
  defaultImages?: string[];
  label?: string;
  hint?: string;
  tileClassName?: string;
  purpose?: ImageUploadPurpose;
  layout?: 'grid' | 'field' | 'toolbar';
  disabled?: boolean;
  disabledReason?: string;
  alwaysShowToolbarTrigger?: boolean;
  showToolbarImageCount?: boolean;
  toolbarSummary?: string;
}
