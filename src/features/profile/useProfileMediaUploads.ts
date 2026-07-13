import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { apiFetch } from '@/services/api';
import {
  COVER_UPLOAD_RETRY_OPTIONS,
  getImageValidationError,
  normalizeImageUploadError,
  uploadImageFile,
} from '@/features/upload/imageUploadPipeline';
import {
  clearObjectUrl,
  normalizePersistentImageUrl,
  parseResponseError,
  stripAvatarCacheBust,
  warmImageUrl,
} from './profileHelpers';

type ProfileMediaUploadUser = {
  id?: string;
  photoUrl?: string | null;
  coverUrl?: string | null;
} | null | undefined;

type UseProfileMediaUploadsOptions = {
  authUserId?: string;
  user: ProfileMediaUploadUser;
  queryClient: any;
  requireAuth: (callback: () => void) => void;
  patchUser: (patch: Record<string, unknown>) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

export function useProfileMediaUploads({
  authUserId,
  user,
  queryClient,
  requireAuth,
  patchUser,
  showToast,
}: UseProfileMediaUploadsOptions) {
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarUploadTokenRef = useRef(0);
  const avatarUploadObjectUrlRef = useRef('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>(() =>
    stripAvatarCacheBust(user?.photoUrl || ''),
  );

  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const coverUploadTokenRef = useRef(0);
  const coverUploadObjectUrlRef = useRef('');
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>(() =>
    normalizePersistentImageUrl(user?.coverUrl || ''),
  );

  useEffect(() => {
    setAvatarPreviewUrl((current) => {
      const nextCanonical = stripAvatarCacheBust(user?.photoUrl || '');
      const currentCanonical = stripAvatarCacheBust(current);
      if (!nextCanonical) return currentCanonical ? current : '';
      if (currentCanonical && currentCanonical !== nextCanonical && isUploadingAvatar) return current;
      return user?.photoUrl || '';
    });
  }, [user?.id, user?.photoUrl]);

  useEffect(() => {
    setCoverPreviewUrl((current) => {
      const nextCanonical = normalizePersistentImageUrl(user?.coverUrl || '');
      const currentCanonical = normalizePersistentImageUrl(current);
      if (!nextCanonical) return currentCanonical ? current : '';
      if (currentCanonical && currentCanonical !== nextCanonical && isUploadingCover) return current;
      return user?.coverUrl || '';
    });
  }, [isUploadingCover, user?.coverUrl, user?.id]);

  useEffect(() => {
    return () => {
      if (avatarUploadObjectUrlRef.current) {
        clearObjectUrl(avatarUploadObjectUrlRef.current);
        avatarUploadObjectUrlRef.current = '';
      }
      if (coverUploadObjectUrlRef.current) {
        clearObjectUrl(coverUploadObjectUrlRef.current);
        coverUploadObjectUrlRef.current = '';
      }
    };
  }, []);

  const handleAvatarButtonClick = useCallback(() => {
    requireAuth(() => {
      avatarInputRef.current?.click();
    });
  }, [requireAuth]);

  const handleCoverButtonClick = useCallback(() => {
    requireAuth(() => {
      coverInputRef.current?.click();
    });
  }, [requireAuth]);

  const handleAvatarFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (isUploadingAvatar) return;
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      return;
    }
    const validationError = getImageValidationError(file, 'avatar');
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const sessionId = ++avatarUploadTokenRef.current;
    const previousAvatar = stripAvatarCacheBust(user?.photoUrl || avatarPreviewUrl);
    if (avatarUploadObjectUrlRef.current) {
      clearObjectUrl(avatarUploadObjectUrlRef.current);
      avatarUploadObjectUrlRef.current = '';
    }

    const nextLocalPreview = URL.createObjectURL(file);
    avatarUploadObjectUrlRef.current = nextLocalPreview;
    setAvatarPreviewUrl(nextLocalPreview);
    setIsUploadingAvatar(true);
    try {
      const finalPhotoUrl = await uploadImageFile(file, { purpose: 'avatar' });
      if (sessionId !== avatarUploadTokenRef.current) return;
      const normalizedPhotoUrl = normalizePersistentImageUrl(finalPhotoUrl || '');

      if (!normalizedPhotoUrl) {
        throw new Error('上传服务返回地址无效');
      }

      setAvatarPreviewUrl(normalizedPhotoUrl);

      const saveRes = await apiFetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: normalizedPhotoUrl }),
      });

      if (sessionId !== avatarUploadTokenRef.current) return;

      if (!saveRes.ok) {
        const saveMessage = await parseResponseError(saveRes, '头像保存失败');
        setAvatarPreviewUrl(previousAvatar);
        patchUser({ photoUrl: previousAvatar || null });
        showToast(saveMessage, 'error');
        return;
      }

      const savedUser = await saveRes.json().catch(() => ({}));
      const savedPhotoUrl = String(savedUser.photoUrl || finalPhotoUrl).trim();
      const normalizedSavedPhoto = normalizePersistentImageUrl(savedPhotoUrl || finalPhotoUrl);
      setAvatarPreviewUrl(normalizedSavedPhoto);
      patchUser({ photoUrl: normalizedSavedPhoto });
      void warmImageUrl(normalizedSavedPhoto, 'avatar');
      queryClient.setQueryData(['user-profile', authUserId], (old: any) => ({
        ...(old || user || {}),
        photoUrl: normalizedSavedPhoto,
      }));
      queryClient.invalidateQueries({ queryKey: ['user-profile', authUserId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['user-profile'], refetchType: 'none' });
      showToast('头像已更新', 'success');
    } catch (error: any) {
      if (sessionId !== avatarUploadTokenRef.current) return;
      const uploadError = normalizeImageUploadError(error);
      setAvatarPreviewUrl(previousAvatar);
      patchUser({ photoUrl: previousAvatar || null });
      showToast(uploadError, 'error');
    } finally {
      if (sessionId === avatarUploadTokenRef.current) {
        if (avatarUploadObjectUrlRef.current === nextLocalPreview) {
          clearObjectUrl(nextLocalPreview);
          avatarUploadObjectUrlRef.current = '';
        }
        setIsUploadingAvatar(false);
      }

      if (sessionId !== avatarUploadTokenRef.current && avatarUploadObjectUrlRef.current === nextLocalPreview) {
        clearObjectUrl(nextLocalPreview);
        avatarUploadObjectUrlRef.current = '';
      }
    }
  }, [authUserId, avatarPreviewUrl, isUploadingAvatar, patchUser, queryClient, showToast, user]);

  const handleCoverFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (isUploadingCover) return;

    const validationError = getImageValidationError(file, 'cover');
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const sessionId = ++coverUploadTokenRef.current;
    const previousCover = normalizePersistentImageUrl(user?.coverUrl || coverPreviewUrl);
    if (coverUploadObjectUrlRef.current) {
      clearObjectUrl(coverUploadObjectUrlRef.current);
      coverUploadObjectUrlRef.current = '';
    }

    const nextLocalPreview = URL.createObjectURL(file);
    coverUploadObjectUrlRef.current = nextLocalPreview;
    setCoverPreviewUrl(nextLocalPreview);
    setIsUploadingCover(true);

    try {
      const finalCoverUrl = await uploadImageFile(file, {
        purpose: 'cover',
        ...COVER_UPLOAD_RETRY_OPTIONS,
      });
      if (sessionId !== coverUploadTokenRef.current) return;

      const normalizedCoverUrl = normalizePersistentImageUrl(finalCoverUrl || '');
      if (!normalizedCoverUrl) {
        throw new Error('上传服务返回地址无效');
      }

      setCoverPreviewUrl(normalizedCoverUrl);

      const saveRes = await apiFetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverUrl: normalizedCoverUrl }),
      });

      if (sessionId !== coverUploadTokenRef.current) return;

      if (!saveRes.ok) {
        const saveMessage = await parseResponseError(saveRes, '封面保存失败');
        setCoverPreviewUrl(previousCover);
        patchUser({ coverUrl: previousCover || null });
        showToast(saveMessage, 'error');
        return;
      }

      const savedCoverUser = await saveRes.json().catch(() => ({ coverUrl: normalizedCoverUrl }));
      const savedCoverUrl = normalizePersistentImageUrl(String(savedCoverUser.coverUrl || normalizedCoverUrl).trim());
      const nextCoverUrl = savedCoverUrl || normalizedCoverUrl;

      setCoverPreviewUrl(nextCoverUrl);
      patchUser({ coverUrl: nextCoverUrl || null });
      queryClient.setQueryData(['user-profile', authUserId], (old: any) => ({
        ...(old || user || {}),
        coverUrl: nextCoverUrl || '',
      }));
      queryClient.invalidateQueries({ queryKey: ['user-profile', authUserId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['user-profile'], refetchType: 'none' });
      if (nextCoverUrl) {
        void warmImageUrl(nextCoverUrl, 'cover');
      }
      showToast('封面已更新', 'success');
    } catch (error: any) {
      if (sessionId !== coverUploadTokenRef.current) return;
      const uploadError = normalizeImageUploadError(error);
      setCoverPreviewUrl(previousCover);
      patchUser({ coverUrl: previousCover || null });
      showToast(uploadError, 'error');
    } finally {
      if (sessionId === coverUploadTokenRef.current) {
        if (coverUploadObjectUrlRef.current === nextLocalPreview) {
          clearObjectUrl(nextLocalPreview);
          coverUploadObjectUrlRef.current = '';
        }
        setIsUploadingCover(false);
      }

      if (sessionId !== coverUploadTokenRef.current && coverUploadObjectUrlRef.current === nextLocalPreview) {
        clearObjectUrl(nextLocalPreview);
        coverUploadObjectUrlRef.current = '';
      }
    }
  }, [authUserId, coverPreviewUrl, isUploadingCover, patchUser, queryClient, showToast, user]);

  const avatarUrl = normalizePersistentImageUrl(avatarPreviewUrl || user?.photoUrl || '');
  const isAvatarUpdating = isUploadingAvatar;

  return {
    avatarInputRef,
    coverInputRef,
    avatarPreviewUrl,
    coverPreviewUrl,
    avatarUrl,
    isAvatarUpdating,
    isUploadingAvatar,
    isUploadingCover,
    handleAvatarButtonClick,
    handleCoverButtonClick,
    handleAvatarFileChange,
    handleCoverFileChange,
  };
}
