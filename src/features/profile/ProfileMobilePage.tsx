import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { APP_ROUTES } from "@/app/routePaths";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfig } from "@/hooks/useDataConfig";
import { useLikes, useMyComments, usePosts } from "@/hooks/useDataPosts";
import { useFans, useFollowingUsers, useUser } from "@/hooks/useDataSocial";
import SEO from "@/platform/SEO";
import {
  apiFetch,
  updatePaymentPassword,
  updatePostPublished,
  deletePost,
  syncPostToTelegram,
  updateProfile,
  updateLoginAccount,
  updateUserPassword,
} from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { useScrollLock } from "@/utils/scrollLock";
import ListReturnScrollRestorer from "@/utils/ListReturnScrollRestorer";
import { normalizeTelegramContactHandle } from "@/utils/contact";
import { formatCompactChineseEngagementCount } from "@/utils/engagement";
import { useInteractionGuard } from "@/hooks/useInteractionGuard";
import {
  normalizeLoginAccount,
  validateLoginAccountForWrite,
} from "@/utils/accountCredentials";
import {
  ACCEPTED_IMAGE_TYPES,
} from "@/features/upload/imageUploadConfig";
import SegmentTabs from "@/ui/SegmentTabs";
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import { PageLoadingState } from "@/ui/LoadingState";
import {
  patchPostInCachedData,
  removePostFromCachedData,
  validatePasswordChange,
} from "@/features/profile/profileHelpers";

import { useProfileMediaUploads } from './useProfileMediaUploads';
import {
  ProfileAuthRequiredState,
  ProfileIdentitySection,
  ProfileListSection,
  type ProfileTabType,
} from './profilePageSections';

const LazyProfileEditDialogs = lazy(() => import('./ProfileEditDialogs'));
const LazyProfileSecuritySheet = lazy(() => import('./ProfileSecuritySheet'));

export default function ProfileMobile() {
  const { user: authUser, requireAuth, logout, refreshUser, patchUser, showToast } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProfileTabType>(() => {
    if (typeof window === 'undefined') return "POSTS";
    try {
      const stored = window.sessionStorage.getItem('profile_active_tab');
      return stored === "POSTS" ||
        stored === "COMMENTS" ||
        stored === "QUOTES" ||
        stored === "LIKED" ||
        stored === "FOLLOWING" ||
        stored === "FANS"
        ? stored
        : "POSTS";
    } catch {
      return "POSTS";
    }
  });
  const listReturnScope = `${location.pathname}${location.search}`;

  const { data: userData } = useUser(authUser?.id, !!authUser?.id);
  const { data: config } = useConfig();
  const telegramChannelUrl = useMemo(() => {
    const legacyConfig = config as { telegram_channel?: unknown } | undefined;
    const value = typeof legacyConfig?.telegram_channel === 'string' ? legacyConfig.telegram_channel.trim() : '';
    return value || null;
  }, [config]);
  const user = useMemo(() => {
    if (!userData) return authUser;
    if (!authUser) return userData;
    const photoUrl = authUser.photoUrl?.trim() || userData.photoUrl?.trim() || '';
    const coverUrl = authUser.coverUrl?.trim() || userData.coverUrl?.trim() || '';
    return {
      ...userData,
      ...authUser,
      photoUrl,
      coverUrl,
    };
  }, [authUser, userData]);
  const {
    avatarInputRef,
    coverInputRef,
    coverPreviewUrl,
    avatarUrl,
    isAvatarUpdating,
    isUploadingAvatar,
    isUploadingCover,
    handleAvatarButtonClick,
    handleCoverButtonClick,
    handleAvatarFileChange,
    handleCoverFileChange,
  } = useProfileMediaUploads({
    authUserId: authUser?.id,
    user,
    queryClient,
    requireAuth,
    patchUser,
    showToast,
  });

  useEffect(() => {
    const handleFocus = () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", authUser?.id] });
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [authUser?.id, queryClient]);

  const [isEditingLoginAccount, setIsEditingLoginAccount] = useState(false);
  const [editLoginAccount, setEditLoginAccount] = useState(user?.loginAccount || "");
  const [isSavingLoginAccount, setIsSavingLoginAccount] = useState(false);

  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContact, setEditContact] = useState(normalizeTelegramContactHandle(user?.contact || ""));
  const [isSavingContact, setIsSavingContact] = useState(false);
  const hasTypedContactInput = Boolean(editContact.trim());
  const normalizedEditingContact = normalizeTelegramContactHandle(editContact);
  const hasInvalidEditingContact = hasTypedContactInput && !normalizedEditingContact;

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isEditingPaymentPassword, setIsEditingPaymentPassword] = useState(false);
  const [editPaymentPassword, setEditPaymentPassword] = useState('');
  const [confirmPaymentPassword, setConfirmPaymentPassword] = useState('');
  const [oldPaymentPassword, setOldPaymentPassword] = useState('');
  const [isSavingPaymentPassword, setIsSavingPaymentPassword] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const canSavePassword = useMemo(() => validatePasswordChange({
    hasExistingPassword: Boolean(user?.hasPassword),
    oldPassword,
    newPassword: editPassword,
    confirmPassword,
    loginAccount: user?.loginAccount,
  }).ok, [user?.hasPassword, user?.loginAccount, oldPassword, editPassword, confirmPassword]);

  // Sync state once when user data is first loaded or when modals are opened specifically,
  // removed the aggressive useEffect [user] that was overwriting user input.

  const isPostsTab = activeTab === "POSTS";
  const isCommentsTab = activeTab === "COMMENTS";
  const isQuotesTab = activeTab === "QUOTES";
  const isLikedTab = activeTab === "LIKED";
  const isFollowingTab = activeTab === "FOLLOWING";
  const isFansTab = activeTab === "FANS";
  const profileTabs = useMemo(
    () => [
      { key: "POSTS", label: "发布" },
      { key: "COMMENTS", label: "评论" },
      { key: "QUOTES", label: "引用" },
      { key: "LIKED", label: "点赞" },
      { key: "FOLLOWING", label: "关注" },
      { key: "FANS", label: "粉丝" },
    ],
    [],
  );
  const profileStats = useMemo(
    () => [
      { key: "HEAT", label: "热度", value: formatCompactChineseEngagementCount(user?.viewCount ?? 0) },
      { key: "POSTS", label: "发布", value: formatCompactChineseEngagementCount(user?.postCount ?? 0), tab: "POSTS" as const },
      { key: "FANS", label: "粉丝", value: formatCompactChineseEngagementCount(user?.followerCount ?? 0), tab: "FANS" as const },
      { key: "FOLLOWING", label: "关注", value: formatCompactChineseEngagementCount(user?.followingCount ?? 0), tab: "FOLLOWING" as const },
    ],
    [user?.followerCount, user?.followingCount, user?.postCount, user?.viewCount],
  );

  const { data: posts = [], isLoading: postsLoading } = usePosts({
    userId: user?.id,
    limit: 30,
    enabled: !!user?.id && isPostsTab,
  });

  const { data: comments = [], isLoading: commentsLoading } = useMyComments(!!user?.id && isCommentsTab);

  const { data: quotePosts = [], isLoading: quotePostsLoading } = usePosts({
    userId: user?.id,
    quotedOnly: true,
    limit: 30,
    enabled: !!user?.id && isQuotesTab,
  });

  const {
    data: followingUsers = [],
    isLoading: followingLoading,
    hasNextPage: hasMoreFollowingUsers,
    fetchNextPage: fetchNextFollowingUsers,
    isFetchingNextPage: isFetchingNextFollowingUsers,
  } = useFollowingUsers(!!user && isFollowingTab);
  const {
    data: fans = [],
    isLoading: fansLoading,
    hasNextPage: hasMoreFans,
    fetchNextPage: fetchNextFans,
    isFetchingNextPage: isFetchingNextFans,
  } = useFans(!!user && isFansTab);
  const { data: likedPosts = [], isLoading: likedLoading } = useLikes(!!user && isLikedTab);
  const activeListReady =
    (isPostsTab && !postsLoading) ||
    (isCommentsTab && !commentsLoading) ||
    (isQuotesTab && !quotePostsLoading) ||
    (isLikedTab && !likedLoading) ||
    (isFollowingTab && !followingLoading) ||
    (isFansTab && !fansLoading);
  const activeListVersion = isPostsTab
    ? posts.length
    : isCommentsTab
    ? comments.length
    : isQuotesTab
    ? quotePosts.length
    : isLikedTab
    ? likedPosts.length
    : isFollowingTab
    ? followingUsers.length
    : fans.length;

  useEffect(() => {
    try {
      window.sessionStorage.setItem('profile_active_tab', activeTab);
    } catch {
      // Ignore blocked session storage; the page still works without tab persistence.
    }
  }, [activeTab]);

  const profileTabLoading = <PageLoadingState text="正在加载" className="profile-tab-loading" />;

  useEffect(() => {
    if (!isSecurityOpen) return;
    setEditDisplayName(user?.displayName || "");
  }, [isSecurityOpen, user?.displayName]);

  const isEditDialogOpen = isEditingLoginAccount || isEditingContact || isEditingPassword || isEditingPaymentPassword || isEditingDisplayName;
  const anyModalOpen = isEditDialogOpen || isSecurityOpen;
  useScrollLock(anyModalOpen, {
    fixed: true,
    allowTouchMove: (target) => {
      if (!(target instanceof Element)) return false;
      const editable = target.closest('input, textarea, [data-scroll-lock-allow]');
      if (!editable) return false;
      if (editable instanceof HTMLTextAreaElement) {
        return editable.scrollHeight > editable.clientHeight;
      }
      return true;
    },
  });

  const handleStatusChange = useCallback(async (
    post: any,
    isPublished: boolean,
  ) => {
    if (!isPublished && !confirm("确定要下架这条信息吗？此操作可在我的页面重新上架。")) {
      return;
    }
    try {
      await updatePostPublished(post.id, isPublished);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      showToast(isPublished ? "信息已重新上架" : "信息已下架", "success");
    } catch (e: any) {
      showToast(e.message || "操作失败", "error");
    }
  }, [queryClient, showToast]);

  const handleDelete = useCallback(async (post: any) => {
    if (!confirm("确定要删除这条信息吗？此操作不可撤销。")) return;
    try {
      await deletePost(post.id);
      queryClient.setQueriesData({ queryKey: ['posts'] }, (old: any) =>
        removePostFromCachedData(old, post.id),
      );
      queryClient.setQueriesData({ queryKey: ['likes'] }, (old: any) =>
        removePostFromCachedData(old, post.id),
      );
      queryClient.removeQueries({ queryKey: ['post', post.id], exact: true });
      await refreshUser(true);
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "infinite"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "following", "infinite"] });
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      queryClient.invalidateQueries({ queryKey: ["user-profile", authUser?.id] });
      showToast("信息彻底删除成功", "success");
    } catch (e: any) {
      showToast(e.message || "删除失败", "error");
    }
  }, [authUser?.id, queryClient, refreshUser, showToast]);

  const handleTelegramSync = useCallback(async (post: any) => {
    const postId = String(post?.id || '').trim();
    if (!postId) return;
    const currentStatus = String(post?.telegramSyncStatus || '').trim().toUpperCase();
    if (currentStatus === 'PENDING') {
      showToast('已提交同步', 'success');
      return;
    }
    if (currentStatus === 'SENT' || (currentStatus === '' && post?.syncToTelegram === true)) {
      showToast('已同步到频道', 'success');
      return;
    }

    const result = await syncPostToTelegram(postId);
    const nextPatch = {
      telegramSyncStatus: result.telegramSyncStatus || 'PENDING',
      telegramSyncedAt: result.telegramSyncedAt ?? null,
      telegramSyncRequestedAt: new Date().toISOString(),
      telegramSyncLastError: null as string | null,
    };
    queryClient.setQueriesData({ queryKey: ['posts'] }, (old: any) =>
      patchPostInCachedData(old, postId, nextPatch),
    );
    queryClient.setQueriesData({ queryKey: ['post', postId] }, (old: any) =>
      patchPostInCachedData(old, postId, nextPatch),
    );
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['sponsor', 'transactions-preview'] });
    void refreshUser(true);
    window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sponsor', 'transactions-preview'] });
      void refreshUser(true);
    }, 2500);
    showToast('已提交同步', 'success');
  }, [queryClient, refreshUser, showToast]);

  const handleSaveLoginAccount = async () => {
    const cleanAccount = normalizeLoginAccount(editLoginAccount);
    const accountError = validateLoginAccountForWrite(cleanAccount);
    if (accountError) {
      showToast(accountError, "error");
      return;
    }
    setIsSavingLoginAccount(true);
    try {
      await updateLoginAccount({ loginAccount: cleanAccount });
      await refreshUser(true);
      queryClient.invalidateQueries({ queryKey: ["user-profile", authUser?.id] });
      setIsEditingLoginAccount(false);
      showToast("登录账号修改成功！", "success");
    } catch (err: any) {
      showToast(err?.message || "更新失败", "error");
    } finally {
      setIsSavingLoginAccount(false);
    }
  };

  const handleSaveProfile = async () => {
    const cleanName = editDisplayName.trim();
    if (!cleanName) {
      showToast('请输入昵称', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateProfile({
        displayName: cleanName,
      });
      await refreshUser(true);
      queryClient.invalidateQueries({ queryKey: ['user-profile', authUser?.id] });
      setIsEditingDisplayName(false);
      showToast('昵称已更新', 'success');
    } catch (err: any) {
      showToast(err?.message || '更新失败', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveContact = async () => {
    const cleanContact = normalizeTelegramContactHandle(editContact);
    if (!cleanContact) {
      showToast("仅支持 Telegram 用户名（5-32位，字母开头，可含数字/下划线）", "error");
      return;
    }
    setIsSavingContact(true);
    try {
      await updateProfile({ contact: cleanContact });
      await refreshUser(true);
      queryClient.invalidateQueries({ queryKey: ["user-profile", authUser?.id] });
      setIsEditingContact(false);
      showToast("联系方式保存成功！", "success");
    } catch (err: any) {
      showToast(err?.message || "更新失败", "error");
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleSavePassword = async () => {
    const hasExistingPassword = Boolean(user?.hasPassword);
    const validation = validatePasswordChange({
      hasExistingPassword,
      oldPassword,
      newPassword: editPassword,
      confirmPassword,
      loginAccount: user?.loginAccount,
    });

    if (!validation.ok) {
      showToast(validation.error as string, "error");
      return;
    }

    setIsSavingPassword(true);
    try {
      await updateUserPassword(validation.payload);
      await refreshUser(true);
      setIsEditingPassword(false);
      setEditPassword("");
      setConfirmPassword("");
      setOldPassword("");
      showToast(hasExistingPassword ? "密码修改成功！" : "密码设置成功！", "success");
    } catch (err: any) {
      showToast(err?.message || "操作失败", "error");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSavePaymentPassword = async () => {
    const hasExistingPaymentPassword = Boolean(user?.hasPaymentPassword);
    const nextOldPaymentPassword = oldPaymentPassword.trim();
    const nextPaymentPassword = editPaymentPassword.trim();
    const nextConfirmPaymentPassword = confirmPaymentPassword.trim();

    if (hasExistingPaymentPassword && !nextOldPaymentPassword) {
      showToast("请输入原支付密码进行确认", "error");
      return;
    }
    if (!nextPaymentPassword || nextPaymentPassword.length < 6) {
      showToast("支付密码至少需要6位", "error");
      return;
    }
    if (nextPaymentPassword !== nextConfirmPaymentPassword) {
      showToast("两次输入的支付密码不一致", "error");
      return;
    }
    if (hasExistingPaymentPassword && nextPaymentPassword === nextOldPaymentPassword) {
      showToast("新支付密码不能和原支付密码相同", "error");
      return;
    }

    setIsSavingPaymentPassword(true);
    try {
      await updatePaymentPassword({
        password: nextPaymentPassword,
        oldPassword: hasExistingPaymentPassword ? nextOldPaymentPassword : undefined,
      });
      patchUser({ hasPaymentPassword: true });
      await refreshUser(true);
      setIsEditingPaymentPassword(false);
      setEditPaymentPassword("");
      setConfirmPaymentPassword("");
      setOldPaymentPassword("");
      showToast(hasExistingPaymentPassword ? "支付密码修改成功" : "支付密码设置成功", "success");
    } catch (e: any) {
      showToast(e?.message || "操作失败", "error");
    } finally {
      setIsSavingPaymentPassword(false);
    }
  };

  const fetchNextFollowingUsersPage = useCallback(async () => {
    if (isFetchingNextFollowingUsers || !hasMoreFollowingUsers) return;
    await fetchNextFollowingUsers();
  }, [fetchNextFollowingUsers, hasMoreFollowingUsers, isFetchingNextFollowingUsers]);
  const fetchNextFansPage = useCallback(async () => {
    if (isFetchingNextFans || !hasMoreFans) return;
    await fetchNextFans();
  }, [fetchNextFans, hasMoreFans, isFetchingNextFans]);
  const openRelationUser = useCallback((targetUserId: string) => {
    if (!targetUserId) return;
    navigate(user?.id === targetUserId ? APP_ROUTES.profile : `/user/${targetUserId}`);
  }, [navigate, user?.id]);
  const openProfileSettings = useCallback(() => {
    setIsSecurityOpen(true);
  }, []);

  const { guarded: guardedStatusChange } = useInteractionGuard(handleStatusChange, 520);
  const { guarded: guardedDelete } = useInteractionGuard(handleDelete, 520);
  const { guarded: guardedSaveLoginAccount } = useInteractionGuard(handleSaveLoginAccount, 520);
  const { guarded: guardedSaveProfile } = useInteractionGuard(handleSaveProfile, 520);
  const { guarded: guardedSaveContact } = useInteractionGuard(handleSaveContact, 520);
  const { guarded: guardedSavePassword } = useInteractionGuard(handleSavePassword, 520);
  const { guarded: guardedSavePaymentPassword } = useInteractionGuard(handleSavePaymentPassword, 520);
  const { guarded: guardedFetchNextFollowingUsers } = useInteractionGuard(fetchNextFollowingUsersPage, {
    policy: 'optimistic',
    cooldownMs: 520,
    mode: 'drop',
  });
  const { guarded: guardedFetchNextFans } = useInteractionGuard(fetchNextFansPage, {
    policy: 'optimistic',
    cooldownMs: 520,
    mode: 'drop',
  });
  const { guarded: guardedOpenRelationUser } = useInteractionGuard<[string]>(openRelationUser, {
    policy: 'instant',
    cooldownMs: 360,
    mode: 'drop',
  });
  const { guarded: guardedOpenProfileSettings } = useInteractionGuard(openProfileSettings, {
    policy: 'instant',
    cooldownMs: 520,
    mode: 'drop',
  });

  if (!user) {
    return (
      <AppPage mobileAddressBarScroll className="profile-modern-page surface-page">
        <SEO title="登录推推" description="登录推推，管理您发布的圈内分类信息、资源和服务。" noindex />
        <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
          <ProfileAuthRequiredState onAction={() => requireAuth(() => navigate(APP_ROUTES.profile))} />
        </PageContentShell>
      </AppPage>
    );
  }

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="profile-modern-page surface-page">
      <ListReturnScrollRestorer
        scope={listReturnScope}
        ready={activeListReady}
        restoreVersion={`${activeTab}:${activeListVersion}`}
      />
      <SEO title="我的个人中心｜推推" description="管理您在推推发布的圈内信息、资源、积分和账号资料。" noindex />
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="ui-file-input-hidden"
        onChange={handleCoverFileChange}
        disabled={isUploadingCover}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="ui-file-input-hidden"
        onChange={handleAvatarFileChange}
        disabled={isAvatarUpdating}
      />

      {isEditDialogOpen ? (
        <Suspense fallback={null}>
          <LazyProfileEditDialogs
            user={user}
            isEditingLoginAccount={isEditingLoginAccount}
            editLoginAccount={editLoginAccount}
            isSavingLoginAccount={isSavingLoginAccount}
            onEditLoginAccount={setEditLoginAccount}
            onLoginAccountOpenChange={setIsEditingLoginAccount}
            onSaveLoginAccount={guardedSaveLoginAccount}
            isEditingDisplayName={isEditingDisplayName}
            editDisplayName={editDisplayName}
            isSavingProfile={isSavingProfile}
            onEditDisplayName={setEditDisplayName}
            onDisplayNameOpenChange={setIsEditingDisplayName}
            onSaveProfile={guardedSaveProfile}
            isEditingContact={isEditingContact}
            editContact={editContact}
            hasTypedContactInput={hasTypedContactInput}
            hasInvalidEditingContact={hasInvalidEditingContact}
            isSavingContact={isSavingContact}
            onEditContact={setEditContact}
            onContactOpenChange={setIsEditingContact}
            onSaveContact={guardedSaveContact}
            isEditingPassword={isEditingPassword}
            oldPassword={oldPassword}
            editPassword={editPassword}
            confirmPassword={confirmPassword}
            isSavingPassword={isSavingPassword}
            canSavePassword={canSavePassword}
            onEditOldPassword={setOldPassword}
            onEditPassword={setEditPassword}
            onEditConfirmPassword={setConfirmPassword}
            onPasswordOpenChange={setIsEditingPassword}
            onSavePassword={guardedSavePassword}
            isEditingPaymentPassword={isEditingPaymentPassword}
            oldPaymentPassword={oldPaymentPassword}
            editPaymentPassword={editPaymentPassword}
            confirmPaymentPassword={confirmPaymentPassword}
            isSavingPaymentPassword={isSavingPaymentPassword}
            onEditOldPaymentPassword={setOldPaymentPassword}
            onEditPaymentPassword={setEditPaymentPassword}
            onEditConfirmPaymentPassword={setConfirmPaymentPassword}
            onPaymentPasswordOpenChange={setIsEditingPaymentPassword}
            onSavePaymentPassword={guardedSavePaymentPassword}
          />
        </Suspense>
      ) : null}

      <PageContentShell as="main" variant="fluid" className="profile-modern-main ui-app-page-main">
        <ProfileIdentitySection
          user={user}
          avatarUrl={avatarUrl}
          coverUrl={coverPreviewUrl}
          profileStats={profileStats}
          activeTab={activeTab}
          isUploadingAvatar={isUploadingAvatar}
          onCoverClick={handleCoverButtonClick}
          onAvatarClick={handleAvatarButtonClick}
          onEditHome={() => void guardedOpenProfileSettings()}
          onTabChange={setActiveTab}
        />

        <div className="profile-tabs-section ui-layer-sticky-tab scrollbar-hide">
          <SegmentTabs
            items={profileTabs}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as ProfileTabType)}
            ariaLabel="个人中心内容分类"
            className="profile-tabbar"
            showLabels
            labelDisplay="full"
          />
        </div>

        <ProfileListSection
          activeTab={activeTab}
          posts={posts}
          comments={comments}
          quotePosts={quotePosts}
          likedPosts={likedPosts}
          followingUsers={followingUsers}
          fans={fans}
          postsLoading={postsLoading}
          commentsLoading={commentsLoading}
          quotePostsLoading={quotePostsLoading}
          likedLoading={likedLoading}
          followingLoading={followingLoading}
          fansLoading={fansLoading}
          isFetchingNextFollowingUsers={isFetchingNextFollowingUsers}
          hasMoreFollowingUsers={Boolean(hasMoreFollowingUsers)}
          isFetchingNextFans={isFetchingNextFans}
          hasMoreFans={Boolean(hasMoreFans)}
          telegramChannelUrl={telegramChannelUrl}
          loadingFallback={profileTabLoading}
          onStatusChange={guardedStatusChange}
          onDelete={guardedDelete}
          onTelegramSync={handleTelegramSync}
          onFetchNextFollowingUsers={() => void guardedFetchNextFollowingUsers()}
          onFetchNextFans={() => void guardedFetchNextFans()}
          onOpenUser={(targetUserId) => void guardedOpenRelationUser(targetUserId)}
        />
      </PageContentShell>
      {isSecurityOpen ? (
        <Suspense fallback={null}>
          <LazyProfileSecuritySheet
            open={isSecurityOpen}
            user={user}
            avatarUrl={avatarUrl}
            isAvatarUpdating={isAvatarUpdating}
            avatarInputRef={avatarInputRef}
            onClose={() => setIsSecurityOpen(false)}
            onEditDisplayName={setEditDisplayName}
            onOpenDisplayNameEditor={() => setIsEditingDisplayName(true)}
            onEditLoginAccount={setEditLoginAccount}
            onOpenLoginAccountEditor={() => setIsEditingLoginAccount(true)}
            onResetPasswordFields={() => {
              setOldPassword('');
              setEditPassword('');
              setConfirmPassword('');
            }}
            onOpenPasswordEditor={() => setIsEditingPassword(true)}
            onResetPaymentPasswordFields={() => {
              setOldPaymentPassword('');
              setEditPaymentPassword('');
              setConfirmPaymentPassword('');
            }}
            onOpenPaymentPasswordEditor={() => setIsEditingPaymentPassword(true)}
            onEditContact={setEditContact}
            onOpenContactEditor={() => setIsEditingContact(true)}
            onLogout={() => {
              setIsSecurityOpen(false);
              logout();
              navigate(APP_ROUTES.home);
            }}
          />
        </Suspense>
      ) : null}
    </AppPage>
  );
}
