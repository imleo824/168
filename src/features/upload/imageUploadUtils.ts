import { useRef } from 'react';

import {
  DEFAULT_MAX_COUNT,
  type FileSlot,
  type FileStatus,
} from './imageUploadTypes';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function normalizeMaxCount(value: number) {
  return Number.isFinite(value)
    ? Math.max(1, Math.trunc(value))
    : DEFAULT_MAX_COUNT;
}

export function normalizeUrlList(urls: readonly string[] = []) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function makeUrlKey(urls: readonly string[]) {
  return urls.join('\n');
}

export function areStringArraysEqual(a: readonly string[] = [], b: readonly string[] = []) {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

export function buildDoneSlots(urls: readonly string[]) {
  return normalizeUrlList(urls).map((url, index): FileSlot => ({
    key: `done-${index}-${url}`,
    previewUrl: url,
    status: 'done',
    progress: 100,
    uploadedUrl: url,
  }));
}

export function isBusyStatus(status: FileStatus) {
  return status === 'pending' || status === 'compressing' || status === 'uploading';
}

export function isQuotaStatus(status: FileStatus) {
  return status !== 'error';
}

export function hasBusySlots(slots: readonly FileSlot[]) {
  return slots.some((slot) => isBusyStatus(slot.status));
}

export function countQuotaSlots(slots: readonly FileSlot[]) {
  return slots.reduce((count, slot) => count + (isQuotaStatus(slot.status) ? 1 : 0), 0);
}

export function getDoneUrls(slots: readonly FileSlot[]) {
  return slots
    .filter((slot) => slot.status === 'done' && slot.uploadedUrl)
    .map((slot) => slot.uploadedUrl!);
}

export function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function getFileFingerprint(file: File) {
  return [file.name, file.size, file.lastModified, file.type].join(':');
}

export function createUploadKey(file: File) {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `upload-${id}-${file.name}`;
}

export function hasDraggedFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types || []).includes('Files');
}

export function hasSlotPatchChanges(slot: FileSlot, patch: Partial<FileSlot>) {
  for (const key of Object.keys(patch) as Array<keyof FileSlot>) {
    if (slot[key] !== patch[key]) return true;
  }

  return false;
}

export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
