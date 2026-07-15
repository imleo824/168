import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import { useAuth } from '@/context/AuthContext';
import { useCategories, useConfig } from '@/hooks/useData';
import { primePostCreateComposerFocus } from '@/utils/postCreateFocusBridge';
import { useFocusScrollStabilizer } from '@/hooks/useFocusScrollStabilizer';
import { useScrollLock } from '@/utils/scrollLock';
import { resolveAdTargetUrlInput } from '@/utils/adTargetUrl';
import { useAsyncFlow } from '@/hooks/useAsyncFlow';
import { bookPromotionBatch, updatePaymentPassword } from '@/services/api';
import PageContentShell from '@/ui/PageContentShell';
import { syncPromotionVisibilityAfterBooking } from '@/features/promote/promotionCache';
import {
  PromoteCheckoutBar,
  PromotePaymentSheet,
  PromotePostPickerSheet,
} from './promoteComponents';
import { PromoteAuthRequiredPage } from './PromoteAuthRequiredPage';
import {
  PromoteAdCreativeSection,
  PromoteCalendarSection,
  PromoteCategorySection,
  PromotePostCard,
  PromoteSlotSection,
  PromoteTargetSection,
  PromoteTypeSection,
} from './promotePageSections';
import { usePromoteDateWindow } from './usePromoteDateWindow';
import { usePromotePostTarget } from './usePromotePostTarget';
import { usePromotePricing } from './usePromotePricing';
import { usePromoteReturnPath } from './usePromoteReturnPath';
import { usePromoteSlots } from './usePromoteSlots';

import {
  DAILY_SLOT_INDEX,
  resolvePromotionType,
  normalizeText,
  normalizeHomeAdSlotIndex,
  normalizePromotionPrice,
  type PromotionTypeId,
} from './promoteBookingUtils';

export default function PromoteMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const promoteState = location.state as {
    from?: string;
    returnState?: any;
    type?: PromotionTypeId;
    postId?: string;
    categoryId?: string;
    homeAdSlot?: number;
  } | null;

  const routeParams = useMemo(() => new URLSearchParams(location.search || ''), [location.search]);
  const queryClient = useQueryClient();

  const {
    rootRef: pageRef,
    onFocusCapture: handlePromoteFocusCapture,
    onBlurCapture: handlePromoteBlurCapture,
  } = useFocusScrollStabilizer('promote-keyboard-active');

  const {
    requireAuth,
    user,
    loading: isAuthLoading,
    showToast,
    refreshUser,
    patchUser,
  } = useAuth();

  const { data: config } = useConfig();
  const { data: categories = [] } = useCategories();

  const handleCreatePost = useCallback(() => {
    primePostCreateComposerFocus();
    navigate('/create');
  }, [navigate]);

  const promotedType: PromotionTypeId | undefined = resolvePromotionType(
    promoteState?.type || routeParams.get('type'),
  );

  const requestedPostId = normalizeText(promoteState?.postId || routeParams.get('postId'));
  const requestedHomeAdSlot = normalizeHomeAdSlotIndex(promoteState?.homeAdSlot ?? routeParams.get('slot'));

  const rootCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [categories]);

  const availabilityDates = usePromoteDateWindow();

  const [selectedType, setSelectedType] = useState<PromotionTypeId>(resolvePromotionType(promotedType) || 'PIN_HOME');
  const [selectedCategoryId, setSelectedCategoryId] = useState(promoteState?.categoryId || routeParams.get('categoryId') || '');
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSavingPaymentPassword, setIsSavingPaymentPassword] = useState(false);
  const [paymentPassword, setPaymentPassword] = useState('');
  const [newPaymentPassword, setNewPaymentPassword] = useState('');
  const [confirmPaymentPassword, setConfirmPaymentPassword] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentPasswordSetupDone, setPaymentPasswordSetupDone] = useState(false);
  const [selectedHomeAdSlot, setSelectedHomeAdSlot] = useState(requestedHomeAdSlot);
  const [adForm, setAdForm] = useState({
    desktopImageUrl: '',
    mobileImageUrl: '',
    targetUrl: '',
  });
  const isBannerAdPromotion = selectedType === 'AD_HOME';
  const isPostPromotion = selectedType === 'PIN_HOME' || selectedType === 'PIN_CATEGORY';
  const activeSlotIndex = isBannerAdPromotion ? selectedHomeAdSlot : DAILY_SLOT_INDEX;

  const routePath = `${location.pathname}${location.search}`;
  const stateReturnPath = promoteState?.from ? promoteState.from : null;
  const {
    handleBack,
  } = usePromoteReturnPath({
    from: promoteState?.from,
    navigate,
    routePath,
    stateReturnPath,
  });

  const {
    canSubmitPromotionTarget,
    effectiveSelectedPost,
    handleSelectPromotablePost,
    isLoadingPromotablePosts,
    isPostPickerOpen,
    isVerifyingSelectedPost,
    openPostPicker,
    orderedPromotablePosts,
    promotablePosts,
    selectedPostHint,
    selectedPostId,
    setIsPostPickerOpen,
  } = usePromotePostTarget({
    isAuthLoading,
    isPostPromotion,
    requestedPostId,
    requireAuth,
    selectedCategoryId,
    selectedType,
    setSelectedCategoryId,
    user,
  });

  useScrollLock(isPostPickerOpen || isBookingModalOpen, {
    fixed: true,
    allowTouchMove: (target) =>
      target instanceof Element && Boolean(target.closest('[data-promote-sheet-scroll]')),
  });

  const slotsPrerequisiteMessage = useMemo(() => {
    if (isAuthLoading || !user?.id) return '正在准备日期';
    if (availabilityDates.length === 0) return '正在准备日期';
    if (selectedType === 'PIN_CATEGORY' && !selectedCategoryId) return '请选择分类';
    return '';
  }, [availabilityDates.length, isAuthLoading, selectedCategoryId, selectedType, user?.id]);
  const canLoadSlots = !slotsPrerequisiteMessage;

  const {
    bookedSlots,
    clearSelectedDates,
    ensureSelectedSlotsStillAvailable,
    fetchSlots,
    handleRetrySlots,
    hasLoadedSlots,
    isConfirmingAvailability,
    isLoadingSlots,
    selectedDateKeys,
    setSelectedDateKeys,
    slotIsBooked,
    slotIsMine,
    slotsLoadError,
  } = usePromoteSlots({
    activeSlotIndex,
    availabilityDates,
    canLoadSlots,
    selectedCategoryId,
    selectedHomeAdSlot,
    selectedType,
    slotsPrerequisiteMessage,
    showToast,
    onPaymentError: setPaymentError,
  });

  const handlePromotionTypeChange = useCallback(
    (typeId: PromotionTypeId) => {
      if (typeId === selectedType) return;

      setSelectedType(typeId);
      clearSelectedDates();

      if (typeId !== 'PIN_CATEGORY') {
        setSelectedCategoryId('');
      } else if (!selectedCategoryId && rootCategories[0]?.id) {
        setSelectedCategoryId(rootCategories[0].id);
      }
    },
    [clearSelectedDates, rootCategories, selectedCategoryId, selectedType],
  );

  const handleHomeAdSlotChange = useCallback(
    (slotIndex: number) => {
      if (slotIndex === selectedHomeAdSlot) return;

      setSelectedHomeAdSlot(slotIndex);
      clearSelectedDates();
    },
    [clearSelectedDates, selectedHomeAdSlot],
  );

  const handleCategoryChange = useCallback(
    (categoryId: string) => {
      if (categoryId === selectedCategoryId) return;

      setSelectedCategoryId(categoryId);
      clearSelectedDates();
    },
    [clearSelectedDates, selectedCategoryId],
  );

  useEffect(() => {
    if (selectedType === 'PIN_CATEGORY' && !selectedCategoryId && rootCategories[0]?.id) {
      setSelectedCategoryId(rootCategories[0].id);
    }
  }, [rootCategories, selectedCategoryId, selectedType]);

  const {
    checkoutContextLabel,
    priceForCategoryPin,
    priceForHomeAdSlot,
    pricePerSlot,
    promotionTypeChoices,
  } = usePromotePricing({
    config,
    rootCategories,
    selectedCategoryId,
    selectedHomeAdSlot,
    selectedType,
  });

  const renderPromotablePostCard = useCallback((post: any, options?: { closeOnSelect?: boolean }) => {
    return (
      <PromotePostCard
        post={post}
        selectedPostId={selectedPostId}
        onSelect={(postId) => handleSelectPromotablePost(postId, Boolean(options?.closeOnSelect))}
      />
    );
  }, [handleSelectPromotablePost, selectedPostId]);

  const bookingBreakdown = useMemo(() => {
    const details = Array.from<string>(selectedDateKeys)
      .sort()
      .filter((dateKey) => !bookedSlots[dateKey]?.slots.includes(activeSlotIndex))
      .map((dateKey) => ({ dateKey, slotIndex: activeSlotIndex }));

    return {
      totalUnits: details.length,
      details,
    };
  }, [activeSlotIndex, bookedSlots, selectedDateKeys]);

  const totalPrice = normalizePromotionPrice(pricePerSlot) * bookingBreakdown.totalUnits;
  const userPoints = user?.points ?? 0;
  const balanceAfter = userPoints - totalPrice;
  const hasPaymentPassword = Boolean(user?.hasPaymentPassword);
  const needsPaymentPasswordSetup = !hasPaymentPassword && !paymentPasswordSetupDone;
  const normalizedPaymentPassword = paymentPassword.trim();
  const normalizedNewPaymentPassword = newPaymentPassword.trim();
  const normalizedConfirmPaymentPassword = confirmPaymentPassword.trim();
  const isSlotAvailabilityTrusted = canLoadSlots && hasLoadedSlots && !slotsLoadError;
  const adTargetUrlCheck = useMemo(() => resolveAdTargetUrlInput(adForm.targetUrl), [adForm.targetUrl]);
  const adTargetUrlError = isBannerAdPromotion && adForm.targetUrl.trim()
    ? adTargetUrlCheck.error
    : '';
  const adCreativeBlockReason = useMemo(() => {
    if (!isBannerAdPromotion) return '';
    if (!adForm.desktopImageUrl) return '请上传电脑端图片';
    if (!adForm.mobileImageUrl) return '请上传移动端图片';
    if (!adForm.targetUrl.trim()) return '请填写跳转链接';
    if (adTargetUrlCheck.error) return adTargetUrlCheck.error;
    return '';
  }, [
    adForm.desktopImageUrl,
    adForm.mobileImageUrl,
    adForm.targetUrl,
    adTargetUrlCheck.error,
    isBannerAdPromotion,
  ]);
  const adCreativeActionLabel = adCreativeBlockReason.includes('电脑端')
    ? '上传电脑图'
    : adCreativeBlockReason.includes('移动端')
      ? '上传移动图'
      : adCreativeBlockReason.includes('填写')
        ? '填写链接'
        : adCreativeBlockReason.includes('跳转')
          ? '检查链接'
          : adCreativeBlockReason
            ? '完善素材'
            : '';

  const {
    run: runConfirmBooking,
    isBusy: isBooking,
  } = useAsyncFlow(async ({ isActive }) => {
    if (!isActive()) return;

    setPaymentError('');

    if (!validateBeforePay()) return;

    if (needsPaymentPasswordSetup) {
      try {
        await setupPaymentPasswordForFirstPay(isActive);
      } catch (err: any) {
        if (!isActive()) return;

        const message = err?.message || '支付密码设置失败，请重试';
        setPaymentError(message);
        showToast(message, 'error');
      }

      return;
    }

    const available = await ensureSelectedSlotsStillAvailable();

    if (!isActive() || !available) return;

    try {
      const verifiedPaymentPassword = getVerifiedPaymentPassword();

      const normalizedAdTargetUrl = isBannerAdPromotion
        ? adTargetUrlCheck.value
        : undefined;

      const result = await bookPromotionBatch({
        type: selectedType,
        dates: bookingBreakdown.details.map((item) => item.dateKey),
        slotIndices: [activeSlotIndex],
        categoryId: selectedType === 'PIN_CATEGORY' ? selectedCategoryId : undefined,
        postId: isPostPromotion ? selectedPostId : undefined,
        adImageUrl: isBannerAdPromotion ? adForm.desktopImageUrl : undefined,
        adMobileImageUrl: isBannerAdPromotion ? adForm.mobileImageUrl : undefined,
        adTargetUrl: normalizedAdTargetUrl,
        paymentPassword: verifiedPaymentPassword,
      });

      if (!isActive()) return;

      showToast(`已支付 ${result.totalPrice} 积分，购买 ${result.bookedCount} 天`, 'success');

      setIsBookingModalOpen(false);
      resetPaymentInputs();
      setSelectedDateKeys(new Set());
      patchUser({ points: result.remainingPoints });

      const visibilityResults = await Promise.allSettled([
        refreshUser(true),
        fetchSlots({ silent: true }),
        syncPromotionVisibilityAfterBooking(queryClient, selectedType),
      ]);

      if (
        isActive() &&
        visibilityResults.some((item) => item.status === 'rejected')
      ) {
        console.warn('[promote] Booking succeeded but post-booking refresh failed.', visibilityResults);
        showToast('购买已成功，页面稍后自动同步', 'info');
      }
    } catch (err: any) {
      if (!isActive()) return;

      const message = err?.message || '购买失败，请重试';

      if (isActive()) {
        setPaymentError(message);
        showToast(message, 'error');
      }

      void refreshPaymentContextAfterFailure();
    }
  }, {
    cooldownMs: 240,
  });

  const canSetPaymentPassword =
    normalizedNewPaymentPassword.length >= 6 &&
    normalizedNewPaymentPassword === normalizedConfirmPaymentPassword;

  const canConfirmPaymentPassword = needsPaymentPasswordSetup
    ? canSetPaymentPassword
    : normalizedPaymentPassword.length >= 6;

  const hasSelectedBookableDates = bookingBreakdown.totalUnits > 0;
  const isInsufficientPoints = hasSelectedBookableDates && totalPrice > userPoints;
  const isPriceInvalid = hasSelectedBookableDates && (!Number.isFinite(totalPrice) || totalPrice <= 0);
  const isPaymentBusy = isBooking || isSavingPaymentPassword || isConfirmingAvailability;

  const canSubmitBooking =
    isSlotAvailabilityTrusted &&
    hasSelectedBookableDates &&
    !isPriceInvalid &&
    !isInsufficientPoints &&
    !isPaymentBusy &&
    canConfirmPaymentPassword &&
    (!isPostPromotion || canSubmitPromotionTarget) &&
    (!isBannerAdPromotion || !adCreativeBlockReason);

  const isBottomActionDisabled =
    !isSlotAvailabilityTrusted ||
    isLoadingSlots ||
    !hasSelectedBookableDates ||
    isPriceInvalid ||
    isInsufficientPoints ||
    isPaymentBusy ||
    (isPostPromotion && !canSubmitPromotionTarget) ||
    (isBannerAdPromotion && Boolean(adCreativeBlockReason));

  const bookingButtonLabel = isBooking
    ? '支付中'
    : isConfirmingAvailability
      ? '确认日期'
      : slotsLoadError
        ? '日期异常'
        : !canLoadSlots
          ? slotsPrerequisiteMessage
        : !hasLoadedSlots || isLoadingSlots
          ? '加载日期'
          : !hasSelectedBookableDates
            ? '请选择日期'
            : isPriceInvalid
              ? '价格未配置'
              : isPostPromotion && !canSubmitPromotionTarget
                ? '请选择要曝光的推'
                : isBannerAdPromotion && adCreativeActionLabel
                  ? adCreativeActionLabel
                  : isInsufficientPoints
                    ? '积分不足'
                    : '确认购买';

  const dateSelectionLocked = !isSlotAvailabilityTrusted || isLoadingSlots || isPaymentBusy;
  const calendarStatusText = slotsLoadError
    ? '日期加载失败'
    : !canLoadSlots
      ? slotsPrerequisiteMessage
    : !hasLoadedSlots || isLoadingSlots
      ? '正在加载日期'
      : selectedDateKeys.size > 0
        ? `已选择 ${selectedDateKeys.size} 天`
        : '选择投放日期';

  const paymentPanelTitle = needsPaymentPasswordSetup
    ? '设置支付密码'
    : paymentPasswordSetupDone
      ? '确认支付'
      : '输入支付密码';

  const paymentPanelDescription = needsPaymentPasswordSetup
    ? '设置后不会扣款，下一步再确认支付'
    : paymentPasswordSetupDone
      ? '支付密码已设置，确认后将扣减积分'
      : '';

  const confirmPaymentButtonLabel = needsPaymentPasswordSetup
    ? (isSavingPaymentPassword ? '设置中' : '设置并继续')
    : isConfirmingAvailability
      ? '确认中'
      : isBooking
        ? '支付中'
        : '确认支付';

  const paymentBusyLabel = isSavingPaymentPassword
    ? '设置中'
    : isConfirmingAvailability
      ? '确认日期中'
      : '支付中';

  const balanceHint = slotsLoadError
    ? '日期加载失败，请重试'
    : !canLoadSlots
      ? slotsPrerequisiteMessage
    : !hasLoadedSlots || isLoadingSlots
      ? '正在加载日期'
      : !hasSelectedBookableDates
        ? '请选择投放日期'
        : isPriceInvalid
          ? '价格配置异常'
          : isBannerAdPromotion && adCreativeBlockReason
            ? adCreativeBlockReason
            : isInsufficientPoints
              ? `还差 ${Math.abs(balanceAfter)} 积分`
              : `${bookingBreakdown.totalUnits} 天`;

  const refreshPaymentContextAfterFailure = useCallback(async () => {
    await Promise.allSettled([
      fetchSlots({ silent: true }),
      refreshUser(true),
      queryClient.invalidateQueries({ queryKey: ['promotions'] }),
      queryClient.invalidateQueries({ queryKey: ['promotions', 'home-ads'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
  }, [fetchSlots, queryClient, refreshUser]);

  const validateBeforePay = () => {
    if (!canLoadSlots) {
      showToast(slotsPrerequisiteMessage || '投放日期正在准备，请稍后再试', 'error');
      return false;
    }

    if (!hasLoadedSlots || isLoadingSlots) {
      showToast('投放日期正在加载，请稍后再试', 'error');
      return false;
    }

    if (slotsLoadError || !isSlotAvailabilityTrusted) {
      showToast(slotsLoadError || '投放日期加载失败，请重试', 'error');
      return false;
    }

    if (bookingBreakdown.totalUnits === 0) {
      showToast('请选择投放日期', 'error');
      return false;
    }

    if (isPriceInvalid) {
      showToast('价格未配置，请联系管理员', 'error');
      return false;
    }

    if (isPostPromotion && !canSubmitPromotionTarget) {
      showToast('请选择要曝光的推', 'error');
      return false;
    }

    if (isBannerAdPromotion) {
      if (adCreativeBlockReason) {
        showToast(adCreativeBlockReason, 'error');
        return false;
      }
    }

    if (isInsufficientPoints) {
      showToast(`积分不足，本次需要 ${totalPrice} 积分`, 'error');
      return false;
    }

    return true;
  };

  const openPaymentSheetAfterValidation = async () => {
    setPaymentError('');

    if (!validateBeforePay()) return;

    const available = await ensureSelectedSlotsStillAvailable();

    if (available) {
      setIsBookingModalOpen(true);
    }
  };

  const handleBookClick = () => {
    requireAuth(() => {
      void openPaymentSheetAfterValidation();
    });
  };

  const resetPaymentInputs = () => {
    setPaymentPassword('');
    setNewPaymentPassword('');
    setConfirmPaymentPassword('');
    setPaymentPasswordSetupDone(false);
  };

  const closeBookingModal = () => {
    if (isPaymentBusy) return;

    setIsBookingModalOpen(false);
    setPaymentError('');
    resetPaymentInputs();
  };

  const setupPaymentPasswordForFirstPay = async (isActive: () => boolean) => {
    if (!isActive()) return;

    setPaymentError('');

    if (normalizedNewPaymentPassword.length < 6) {
      throw new Error('支付密码至少需要6位');
    }

    if (normalizedNewPaymentPassword !== normalizedConfirmPaymentPassword) {
      throw new Error('两次输入的支付密码不一致');
    }

    setIsSavingPaymentPassword(true);

    try {
      if (!isActive()) return;

      await updatePaymentPassword({ password: normalizedNewPaymentPassword });
      if (!isActive()) return;

      patchUser({ hasPaymentPassword: true });
      setPaymentPassword(normalizedNewPaymentPassword);
      setNewPaymentPassword('');
      setConfirmPaymentPassword('');
      setPaymentPasswordSetupDone(true);
      showToast('支付密码已设置，请确认支付', 'success');
    } finally {
      if (isActive()) {
        setIsSavingPaymentPassword(false);
      }
    }
  };

  const getVerifiedPaymentPassword = () => {
    const nextPaymentPassword = normalizedPaymentPassword;

    if (nextPaymentPassword.length < 6) {
      throw new Error('请输入支付密码');
    }

    return nextPaymentPassword;
  };

  const handleConfirmBooking = () => {
    void runConfirmBooking();
  };

  if (!isAuthLoading && !user) {
    return (
      <PromoteAuthRequiredPage
        onBack={handleBack}
        onLogin={() => requireAuth()}
      />
    );
  }

  return (
    <AppPage
      ref={pageRef}
      onFocusCapture={handlePromoteFocusCapture}
      onBlurCapture={handlePromoteBlurCapture}
      className="promote-mobile-page promote-page surface-page"
    >
      <SEO title="买曝光｜推推" description="在推推购买首页横幅、热门置顶和分类置顶，让内容更容易被看到。" />

      <PageHeader
        title="买曝光"
        onBack={handleBack}
      />

      <PageContentShell className="promote-content-shell ui-app-page-main">
        <PromoteTypeSection
          choices={promotionTypeChoices}
          selectedType={selectedType}
          onTypeChange={handlePromotionTypeChange}
        />

        {isBannerAdPromotion ? (
          <PromoteSlotSection
            selectedType={selectedType}
            selectedHomeAdSlot={selectedHomeAdSlot}
            priceForHomeAdSlot={priceForHomeAdSlot}
            onHomeAdSlotChange={handleHomeAdSlotChange}
          />
        ) : null}

        {selectedType === 'PIN_CATEGORY' ? (
          <PromoteCategorySection
            categories={rootCategories}
            selectedCategoryId={selectedCategoryId}
            priceForCategoryPin={priceForCategoryPin}
            onCategoryChange={handleCategoryChange}
          />
        ) : null}

        {isPostPromotion ? (
          <PromoteTargetSection
            effectiveSelectedPost={effectiveSelectedPost}
            selectedPostHint={selectedPostHint}
            selectedPostId={selectedPostId}
            isVerifyingSelectedPost={isVerifyingSelectedPost}
            isLoadingPromotablePosts={isLoadingPromotablePosts}
            promotablePostsCount={promotablePosts.length}
            onOpenPostPicker={openPostPicker}
            renderPromotablePostCard={renderPromotablePostCard}
          />
        ) : (
          <PromoteAdCreativeSection
            adForm={adForm}
            adTargetUrlError={adTargetUrlError}
            onAdFormChange={setAdForm}
          />
        )}

        <PromoteCalendarSection
          availabilityDates={availabilityDates}
          selectedDateKeys={selectedDateKeys}
          slotsLoadError={slotsLoadError}
          slotsPrerequisiteMessage={slotsPrerequisiteMessage}
          isLoadingSlots={isLoadingSlots}
          hasLoadedSlots={hasLoadedSlots}
          isSlotAvailabilityTrusted={isSlotAvailabilityTrusted}
          dateSelectionLocked={dateSelectionLocked}
          isPaymentBusy={isPaymentBusy}
          calendarStatusText={calendarStatusText}
          slotIsBooked={slotIsBooked}
          slotIsMine={slotIsMine}
          onRetrySlots={handleRetrySlots}
          onToggleDate={(dateKey) => {
            setSelectedDateKeys((prev) => {
              const next = new Set(prev);
              if (next.has(dateKey)) next.delete(dateKey);
              else next.add(dateKey);
              return next;
            });
          }}
        />

      </PageContentShell>

      <PromoteCheckoutBar
        hidden={isPostPickerOpen || isBookingModalOpen}
        totalPrice={totalPrice}
        isInsufficientPoints={isInsufficientPoints}
        balanceHint={balanceHint}
        checkoutContextLabel={checkoutContextLabel}
        onBookClick={handleBookClick}
        disabled={isBottomActionDisabled}
        bookingButtonLabel={bookingButtonLabel}
        isBooking={isBooking}
        isConfirmingAvailability={isConfirmingAvailability}
      />

      <PromotePostPickerSheet
        open={isPostPickerOpen}
        onClose={() => setIsPostPickerOpen(false)}
        isLoadingPromotablePosts={isLoadingPromotablePosts}
        orderedPromotablePosts={orderedPromotablePosts}
        renderPromotablePostCard={renderPromotablePostCard}
        onCreatePost={handleCreatePost}
      />

      <PromotePaymentSheet
        open={isBookingModalOpen}
        onClose={closeBookingModal}
        isPaymentBusy={isPaymentBusy}
        paymentPanelTitle={paymentPanelTitle}
        paymentPanelDescription={paymentPanelDescription}
        selectedType={selectedType}
        bookingDays={bookingBreakdown.totalUnits}
        totalPrice={totalPrice}
        needsPaymentPasswordSetup={needsPaymentPasswordSetup}
        newPaymentPassword={newPaymentPassword}
        confirmPaymentPassword={confirmPaymentPassword}
        normalizedNewPaymentPassword={normalizedNewPaymentPassword}
        normalizedConfirmPaymentPassword={normalizedConfirmPaymentPassword}
        paymentPassword={paymentPassword}
        paymentPasswordSetupDone={paymentPasswordSetupDone}
        paymentError={paymentError}
        canSubmitBooking={canSubmitBooking}
        confirmPaymentButtonLabel={confirmPaymentButtonLabel}
        paymentBusyLabel={paymentBusyLabel}
        onNewPaymentPasswordChange={(value) => {
          setNewPaymentPassword(value);
          if (paymentError) setPaymentError('');
        }}
        onConfirmPaymentPasswordChange={(value) => {
          setConfirmPaymentPassword(value);
          if (paymentError) setPaymentError('');
        }}
        onPaymentPasswordChange={(value) => {
          setPaymentPassword(value);
          if (paymentError) setPaymentError('');
        }}
        onConfirmBooking={handleConfirmBooking}
      />

    </AppPage>
  );
}
