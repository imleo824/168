import { type ReactNode } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Pin } from 'lucide-react';

import ImageUpload from '@/features/upload/ImageUpload';
import OptimizedImage from '@/ui/OptimizedImage';
import { InlineSpinner } from '@/ui/LoadingState';
import { resolveAdTargetUrlInput } from '@/utils/adTargetUrl';

import { StepHeader } from './promoteComponents';
import {
  HOME_AD_SLOTS,
  getSlotStatusLabel,
  getPostThumbnail,
  promotionTypeLabel,
  toDateKey,
  type PromotionTypeId,
} from './promoteBookingUtils';

export type PromotionTypeChoice = {
  id: PromotionTypeId;
  desc: string;
  price: number;
  disabled?: boolean;
};

export type PromoteAdFormState = {
  desktopImageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
};

export function PromoteTypeSection({
  choices,
  selectedType,
  onTypeChange,
}: {
  choices: PromotionTypeChoice[];
  selectedType: PromotionTypeId;
  onTypeChange: (typeId: PromotionTypeId) => void;
}) {
  return (
    <section className="promote-section">
      <StepHeader
        step={1}
        title="选择投放位置"
      />

      <div className="promote-type-grid">
        {choices.map((type) => {
          const active = selectedType === type.id;
          const disabled = Boolean(type.disabled);

          return (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                if (!disabled) onTypeChange(type.id);
              }}
              aria-label={`选择推广位置：${type.desc}，${type.price || 0}积分每天`}
              aria-pressed={active}
              aria-disabled={disabled}
              disabled={disabled}
              className={`pressable promote-type-card ${
                disabled
                  ? 'is-disabled promote-card-idle'
                  : active
                    ? 'is-active promote-card-active'
                    : 'promote-card-idle'
              }`}
            >
              <div className="promote-type-card-main">
                <span className="promote-type-card-copy promote-type-card-copy--simple">
                  <span className={`promote-type-card-desc ${
                    active ? 'promote-type-card-desc-active' : 'promote-type-card-desc-idle'
                  }`}>
                    {type.desc}
                  </span>
                </span>
              </div>

              <div className={`promote-card-price ${
                active ? 'promote-card-price-active' : 'promote-card-price-idle'
              }`}>
                {type.price || 0}积分 / 天
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PromoteSlotSection({
  selectedType,
  selectedHomeAdSlot,
  priceForHomeAdSlot,
  priceForChatAdSlot,
  onHomeAdSlotChange,
}: {
  selectedType: PromotionTypeId;
  selectedHomeAdSlot: number;
  priceForHomeAdSlot: (slotIndex: number) => number;
  priceForChatAdSlot: (slotIndex: number) => number;
  onHomeAdSlotChange: (slotIndex: number) => void;
}) {
  return (
    <section className="promote-section">
      <StepHeader
        title={selectedType === 'PIN_CHAT' ? '聊天室置顶位置' : '首页横幅广告位置'}
      />

      <div className="promote-slot-grid">
        {HOME_AD_SLOTS.map((slot) => {
          const active = selectedHomeAdSlot === slot.index;
          const price = selectedType === 'PIN_CHAT'
            ? priceForChatAdSlot(slot.index)
            : priceForHomeAdSlot(slot.index);

          return (
            <button
              key={slot.index}
              type="button"
              onClick={() => onHomeAdSlotChange(slot.index)}
              aria-label={`选择${selectedType === 'PIN_CHAT' ? promotionTypeLabel('PIN_CHAT') : promotionTypeLabel('AD_HOME')}${slot.desc}，${price || 0}积分每天`}
              aria-pressed={active}
              className={`pressable promote-slot-card ${
                active ? 'is-active promote-card-active' : 'promote-card-idle'
              }`}
            >
              <span className="promote-slot-card-main">
                <span className={`promote-type-card-desc ${
                  active ? 'promote-type-card-desc-active' : 'promote-type-card-desc-idle'
                }`}>
                  {slot.desc}
                </span>
              </span>

              <span className={`promote-card-price ${
                active ? 'promote-card-price-active' : 'promote-card-price-idle'
              }`}>
                {price || 0}积分 / 天
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PromoteCategorySection({
  categories,
  selectedCategoryId,
  priceForCategoryPin,
  onCategoryChange,
}: {
  categories: any[];
  selectedCategoryId: string;
  priceForCategoryPin: (categoryId?: string) => number;
  onCategoryChange: (categoryId: string) => void;
}) {
  if (categories.length === 0) return null;

  return (
    <section className="promote-section promote-category-section">
      <StepHeader title="选择要置顶的分类" />

      <div className="promote-category-rail scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onCategoryChange(cat.id)}
            className={`pressable promote-category-chip ${
              selectedCategoryId === cat.id
                ? 'promote-category-chip-active'
                : 'promote-category-chip-idle'
            }`}
          >
            <span className="promote-category-chip-label">{cat.name}</span>
            <span className="promote-category-chip-value">{priceForCategoryPin(cat.id)}积分/天</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function PromotePostCard({
  post,
  selectedPostId,
  onSelect,
}: {
  post: any;
  selectedPostId: string;
  onSelect: (postId: string) => void;
}) {
  const postThumb = getPostThumbnail(post);
  const isSelected = selectedPostId === post.id;
  const bodyText = String(post.content || post.title || '无标题内容').trim();

  return (
    <button
      type="button"
      onClick={() => onSelect(post.id)}
      className={`pressable promote-post-card ${isSelected ? 'is-active promote-card-active' : 'promote-card-idle'}`}
    >
      <span className="promote-post-card-content">
        <span className="promote-post-card-media-wrap">
          {postThumb ? (
            <OptimizedImage
              src={postThumb}
              alt={`${bodyText} 的推广图片`}
              className="promote-post-card-media"
              variant="thumb"
            />
          ) : (
            <span className="promote-post-card-media-fallback">
              <Pin className="promote-post-card-fallback-icon" />
            </span>
          )}
        </span>

        <span className="promote-post-card-body">
          <span className="promote-post-card-title">{bodyText}</span>
        </span>
      </span>
    </button>
  );
}

export function PromoteTargetSection({
  effectiveSelectedPost,
  selectedPostHint,
  selectedPostId,
  isVerifyingSelectedPost,
  isLoadingPromotablePosts,
  promotablePostsCount,
  onOpenPostPicker,
  renderPromotablePostCard,
}: {
  effectiveSelectedPost: any;
  selectedPostHint: string;
  selectedPostId: string;
  isVerifyingSelectedPost: boolean;
  isLoadingPromotablePosts: boolean;
  promotablePostsCount: number;
  onOpenPostPicker: () => void;
  renderPromotablePostCard: (post: any) => ReactNode;
}) {
  return (
    <section className="promote-section">
      <StepHeader
        step={2}
        title="选择推广帖子"
        action={(
          <button
            type="button"
            onClick={onOpenPostPicker}
            className="pressable ui-compact-action promote-picker-action"
            aria-label="选择推广帖子"
          >
            <span className="promote-picker-action-label">{selectedPostId ? '更换帖子' : '选择帖子'}</span>
            <ChevronRight className="promote-picker-action-icon" />
          </button>
        )}
      />

      {effectiveSelectedPost && !selectedPostHint ? (
        <div className="promote-selected-post-grid">
          {renderPromotablePostCard(effectiveSelectedPost)}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenPostPicker}
          className="pressable promote-target-empty"
        >
          <span className="promote-target-empty-main">
            <span className="promote-target-empty-title">
              {selectedPostHint ||
                (
                  isVerifyingSelectedPost || isLoadingPromotablePosts
                    ? '正在加载你的帖子'
                    : promotablePostsCount > 0
                      ? `可选 ${promotablePostsCount} 条本人帖子`
                      : '仅可选择本人发布的帖子'
                )}
            </span>
          </span>
          <ChevronRight className="promote-target-empty-icon" />
        </button>
      )}
    </section>
  );
}

export function PromoteAdCreativeSection({
  adForm,
  adTargetUrlError,
  onAdFormChange,
}: {
  adForm: PromoteAdFormState;
  adTargetUrlError: string;
  onAdFormChange: (nextForm: PromoteAdFormState | ((prev: PromoteAdFormState) => PromoteAdFormState)) => void;
}) {
  return (
    <section className="promote-section">
      <StepHeader
        step={2}
        title="广告素材"
        hint="上传双端图片并填写点击后跳转的位置"
      />

      <div className="promote-ad-form">
        <div className="promote-ad-field">
          <span className="promote-ad-field-label">
            电脑端广告图 · 建议 1920×480，文字居中，避免贴边
          </span>

          <ImageUpload
            onImagesChange={(urls) => onAdFormChange((prev) => ({ ...prev, desktopImageUrl: urls[0] || '' }))}
            maxCount={1}
            defaultImages={adForm.desktopImageUrl ? [adForm.desktopImageUrl] : []}
            tileClassName="ad-upload-tile ad-upload-tile--desktop"
            purpose="ad-desktop"
          />
        </div>

        <div className="promote-ad-field">
          <span className="promote-ad-field-label">
            移动端广告图 · 建议 1080×360，重点信息放中间
          </span>

          <ImageUpload
            onImagesChange={(urls) => onAdFormChange((prev) => ({ ...prev, mobileImageUrl: urls[0] || '' }))}
            maxCount={1}
            defaultImages={adForm.mobileImageUrl ? [adForm.mobileImageUrl] : []}
            tileClassName="ad-upload-tile ad-upload-tile--mobile"
            purpose="ad-mobile"
          />
        </div>

        <div className="promote-ad-field">
          <span className="promote-ad-field-label">点击跳转地址</span>

          <input
            id="promote-ad-target-url"
            type="text"
            name="promote-ad-target-url"
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="填写网址、Telegram 频道、机器人或联系方式"
            className="ui-control promote-ad-input"
            value={adForm.targetUrl}
            maxLength={2048}
            aria-invalid={Boolean(adTargetUrlError)}
            aria-describedby={adTargetUrlError ? 'promote-ad-target-url-feedback' : undefined}
            onChange={(e) => onAdFormChange((prev) => ({ ...prev, targetUrl: e.target.value }))}
            onBlur={() => {
              const result = resolveAdTargetUrlInput(adForm.targetUrl);
              if (result.value && result.value !== adForm.targetUrl.trim()) {
                onAdFormChange((prev) => ({ ...prev, targetUrl: result.value }));
              }
            }}
          />
          {adTargetUrlError ? (
            <p id="promote-ad-target-url-feedback" role="alert" className="promote-ad-field-feedback">
              {adTargetUrlError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PromoteCalendarSection({
  availabilityDates,
  selectedDateKeys,
  slotsLoadError,
  slotsPrerequisiteMessage,
  isLoadingSlots,
  hasLoadedSlots,
  isSlotAvailabilityTrusted,
  dateSelectionLocked,
  isPaymentBusy,
  calendarStatusText,
  slotIsBooked,
  slotIsMine,
  onRetrySlots,
  onToggleDate,
}: {
  availabilityDates: Date[];
  selectedDateKeys: Set<string>;
  slotsLoadError: string;
  slotsPrerequisiteMessage: string;
  isLoadingSlots: boolean;
  hasLoadedSlots: boolean;
  isSlotAvailabilityTrusted: boolean;
  dateSelectionLocked: boolean;
  isPaymentBusy: boolean;
  calendarStatusText: string;
  slotIsBooked: (dateKey: string) => boolean;
  slotIsMine: (dateKey: string) => boolean;
  onRetrySlots: () => void;
  onToggleDate: (dateKey: string) => void;
}) {
  return (
    <section className="promote-section promote-section--terminal">
      <StepHeader
        step={3}
        title="选择投放日期"
        action={(
          <span className="promote-step-date-status" aria-live="polite">
            {(!hasLoadedSlots || isLoadingSlots) ? (
              <InlineSpinner size="xs" className="promote-step-date-status-spinner" />
            ) : null}
            <span
              className={`promote-step-date-status-text ${slotsLoadError ? 'promote-step-date-status-text--error' : 'promote-step-date-status-text--idle'}`}
            >
              {calendarStatusText}
            </span>
          </span>
        )}
      />

      <div className="promote-calendar-card">
        {slotsLoadError ? (
          <div className="promote-calendar-status promote-calendar-status--error" role="alert">
            <span className="promote-calendar-status-text">
              {slotsLoadError}
            </span>
            <button
              type="button"
              onClick={onRetrySlots}
              className="pressable promote-calendar-retry"
            >
              再试一次
            </button>
          </div>
        ) : null}

        <div className="promote-calendar-grid">
          {availabilityDates.map((date) => {
            const dateKey = toDateKey(date);
            const isBooked = slotIsBooked(dateKey);
            const isMine = slotIsMine(dateKey);
            const isSelected = selectedDateKeys.has(dateKey);
            const cellStatus = !isSlotAvailabilityTrusted
              ? (slotsLoadError ? '排期加载失败' : slotsPrerequisiteMessage || '排期加载中')
              : isBooked
                ? getSlotStatusLabel(true, isMine)
                : isSelected
                  ? '已选'
                  : '可投放';
            const isDateCellDisabled = isBooked || dateSelectionLocked;

            return (
              <button
                key={dateKey}
                type="button"
                aria-label={`${format(date, 'MM/dd')} ${cellStatus}`}
                onClick={() => {
                  if (!isDateCellDisabled) onToggleDate(dateKey);
                }}
                aria-pressed={isSelected}
                disabled={isDateCellDisabled}
                className={`pressable promote-date-cell ${
                  isBooked
                    ? isMine
                      ? 'promote-date-cell-booked-own'
                      : 'promote-date-cell-booked'
                    : !isSlotAvailabilityTrusted || isLoadingSlots
                      ? 'promote-date-cell-unavailable'
                      : isPaymentBusy
                        ? 'promote-date-cell-loading'
                        : isSelected
                          ? 'promote-date-cell-selected'
                          : 'promote-date-cell-idle'
                }`}
              >
                <span
                  className={`promote-calendar-cell-date ${
                    !isSlotAvailabilityTrusted
                      ? 'ui-text-disabled'
                      : isSelected
                        ? 'ui-text-inverse'
                        : isBooked
                          ? isMine
                            ? 'ui-text-success'
                            : 'ui-text-warning'
                          : 'ui-text-muted'
                  }`}
                >
                  {format(date, 'MM/dd')}
                </span>

                <span
                  className={`promote-calendar-cell-meta ${
                    !isSlotAvailabilityTrusted
                      ? 'ui-text-disabled'
                      : isSelected
                        ? 'ui-text-inverse'
                        : isBooked
                          ? isMine
                            ? 'ui-text-success'
                            : 'ui-text-warning'
                          : 'ui-text-strong'
                  }`}
                >
                  {isBooked
                    ? getSlotStatusLabel(true, isMine)
                    : !isSlotAvailabilityTrusted
                      ? (slotsLoadError ? '重试' : slotsPrerequisiteMessage || '加载')
                      : isSelected
                        ? '已选'
                        : format(date, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
