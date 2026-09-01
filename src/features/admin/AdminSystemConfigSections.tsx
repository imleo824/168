import type { Dispatch, SetStateAction } from 'react';
import { ArrowDown, ArrowUp, Image, Pin, Plus, Trash2 } from 'lucide-react';
import { getPromotionTypeLabel, type LocationPresetConfig, type PublishCategoryMetaConfig, type PublishCategoryMetaFieldConfig } from '@/types';
import { ConfigItem } from './adminChrome';
import { PUBLISH_CATEGORY_FIELD_TYPES } from './adminConfigSchema';
import type { AdConfigSection, OpsConfigSection, PublishCategoryFieldType, TelegramConfigSection } from './adminTypes';

type SectionTab = 'ad' | 'telegram' | 'ops';

type AdminSystemConfigSectionsProps = {
  activeSectionConfigTab: SectionTab;
  configSectionId: AdConfigSection | TelegramConfigSection | OpsConfigSection;
  localConfig: any;
  setLocalConfig: Dispatch<SetStateAction<any>>;
  categories?: any[];
  telegramSyncRequireImage: boolean;
  locationPresets: LocationPresetConfig[];
  addLocationPreset: () => void;
  moveLocationPreset: (index: number, direction: -1 | 1) => void;
  updateLocationPreset: (index: number, patch: Partial<LocationPresetConfig>) => void;
  removeLocationPreset: (index: number) => void;
  publishCategorySchema: PublishCategoryMetaConfig[];
  addPublishCategory: () => void;
  movePublishCategory: (index: number, direction: -1 | 1) => void;
  updatePublishCategory: (index: number, patch: Partial<PublishCategoryMetaConfig>) => void;
  removePublishCategory: (index: number) => void;
  addPublishCategoryField: (categoryIndex: number) => void;
  updatePublishCategoryField: (categoryIndex: number, fieldIndex: number, patch: Partial<PublishCategoryMetaFieldConfig>) => void;
  removePublishCategoryField: (categoryIndex: number, fieldIndex: number) => void;
};

export function AdminSystemConfigSections({
  activeSectionConfigTab,
  configSectionId,
  localConfig,
  setLocalConfig,
  categories,
  telegramSyncRequireImage,
  locationPresets,
  addLocationPreset,
  moveLocationPreset,
  updateLocationPreset,
  removeLocationPreset,
  publishCategorySchema,
  addPublishCategory,
  movePublishCategory,
  updatePublishCategory,
  removePublishCategory,
  addPublishCategoryField,
  updatePublishCategoryField,
  removePublishCategoryField,
}: AdminSystemConfigSectionsProps) {
  const updateConfigValue = (key: string, value: unknown) => {
    setLocalConfig((current: any) => ({ ...current, [key]: value }));
  };
  const updatePriceValue = (key: string, value: unknown, extra: Record<string, number> = {}) => {
    const numericValue = Number(value);
    setLocalConfig((current: any) => ({
      ...current,
      prices: {
        ...current?.prices,
        [key]: numericValue,
        ...extra,
      },
    }));
  };
  const updateCategoryPrice = (slug: string, value: unknown) => {
    setLocalConfig((current: any) => ({
      ...current,
      prices: {
        ...current?.prices,
        pin_category_map: {
          ...current?.prices?.pin_category_map,
          [slug]: Number(value),
        },
      },
    }));
  };

  return (
    <>
      {activeSectionConfigTab === 'ad' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  <div className="admin-section-card flex flex-col">
                    <h3 className="text-sm sm:text-lg font-black flex items-center gap-2 mb-4 sm:mb-6 admin-section-heading--pin">
                      <Pin size={20} /> 列表置顶价格
                    </h3>
                    <div className="space-y-4 sm:space-y-6 flex-1">
                      <ConfigItem
                        label="首页列表置顶"
                        value={localConfig?.prices?.pin_home}
                        onChange={(v) => updatePriceValue('pin_home', v)}
                      />
                      <div className="space-y-3 pt-2">
                        <p className="admin-field-label admin-field-label--section">分类单独定价</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                          {[...(categories || [])]
                            .sort((a, b) => (a.order || 0) - (b.order || 0))
                            .map((cat) => {
                              const fallback = Number(localConfig?.prices?.pin_home || 0);
                              const priceMap = localConfig?.prices?.pin_category_map || {};
                              const hasCategoryOverride = Object.prototype.hasOwnProperty.call(priceMap, cat.slug);
                              const current = Number(priceMap?.[cat.slug]);
                              const value = hasCategoryOverride && Number.isFinite(current) ? current : fallback;
                              return (
                                <div key={cat.id}>
                                  <ConfigItem
                                    label={cat.name}
                                    value={value}
                                    onChange={(v) => updateCategoryPrice(cat.slug, v)}
                                  />
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="admin-section-card flex flex-col">
                    <h3 className="text-sm sm:text-lg font-black flex items-center gap-2 mb-4 sm:mb-6 admin-section-heading--ad">
                      <Image size={20} /> 首页横幅广告投放
                    </h3>
                    <div className="space-y-4 sm:space-y-6 flex-1">
                      <ConfigItem
                        label="首页横幅第1位置"
                        value={localConfig?.prices?.ad_home_slot_1}
                        onChange={(v) => updatePriceValue('ad_home_slot_1', v)}
                      />
                      <ConfigItem
                        label="首页横幅第2位置"
                        value={localConfig?.prices?.ad_home_slot_2}
                        onChange={(v) => updatePriceValue('ad_home_slot_2', v)}
                      />
                      <ConfigItem
                        label="首页横幅第3位置"
                        value={localConfig?.prices?.ad_home_slot_3}
                        onChange={(v) => updatePriceValue('ad_home_slot_3', v)}
                      />
                    </div>
                  </div>

                  <div className="admin-section-card flex flex-col md:col-span-2 2xl:col-span-3">
                    <h3 className="text-sm sm:text-lg font-black flex items-center gap-2 mb-4 sm:mb-6 admin-section-heading--default">
                      <Image size={20} /> 发布相关价格
                    </h3>
                    <div className="space-y-4 sm:space-y-6 flex-1">
                      <ConfigItem
                        label="匿名发布积分"
                        value={localConfig?.prices?.anonymous_publish}
                        onChange={(v) => updatePriceValue('anonymous_publish', v)}
                      />
                      <ConfigItem
                        label="同步频道价格"
                        value={localConfig?.prices?.telegram_sync}
                        onChange={(v) => updatePriceValue('telegram_sync', v)}
                      />
                    </div>
                  </div>
              </div>
            ) : activeSectionConfigTab === 'telegram' ? (
              <div className="grid grid-cols-1 gap-6">
                {configSectionId === 'connection' && (
                  <div className="admin-section-card">
                    <div className="space-y-6">
                      <h5 className="admin-text-title-sm">连接配置</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <ConfigItem
                          label="Telegram Bot Token"
                          type="text"
                          value={localConfig?.telegram_bot_token}
                          onChange={(v) => updateConfigValue('telegram_bot_token', v)}
                        />
                        <ConfigItem
                          label="Telegram Channel ID"
                          type="text"
                          value={localConfig?.telegram_channel_id}
                          onChange={(v) => updateConfigValue('telegram_channel_id', v)}
                        />
                        <ConfigItem
                          label="充值通知 Chat ID"
                          type="text"
                          value={localConfig?.telegram_recharge_notify_chat_id}
                          onChange={(v) => updateConfigValue('telegram_recharge_notify_chat_id', v)}
                          help="用户提交新充值订单后，Bot 会把运营摘要发到这个个人或私密群 Chat ID"
                        />
                        <div className="space-y-2 sm:col-span-2">
                          <label className="admin-field-label admin-field-label--section admin-field-label--block">频道链接</label>
                          <input
                            type="text"
                            className="admin-form-control admin-form-control--xlarge admin-form-control--muted"
                            value={localConfig?.telegram_channel || ''}
                            onChange={(e) => updateConfigValue('telegram_channel', e.target.value)}
                            placeholder="https://t.me/your_channel"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSectionId === 'filter' && (
                  <div className="admin-section-card">
                    <div className="space-y-6">
                      <h5 className="admin-text-title-sm">同步规则</h5>
                      <div className="admin-config-surface admin-config-surface--comfortable">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h6 className="admin-text-title-sm">同步频道门槛</h6>
                          <span className="admin-form-note admin-form-note--emphasis">满足条件才会推送频道</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <ConfigItem
                            label="最少正文字数"
                            type="number"
                            value={localConfig?.telegram_sync_min_content_chars ?? 0}
                            onChange={(v) => updateConfigValue('telegram_sync_min_content_chars', Number(v) || 0)}
                          />
                          <div className="space-y-2">
                            <label className="admin-field-label admin-field-label--section">同步需含图片</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => updateConfigValue('telegram_sync_require_image', 'false')}
                                className="admin-choice-button"
                                data-state={!telegramSyncRequireImage ? 'selected' : 'idle'}
                              >
                                不强制
                              </button>
                              <button
                                type="button"
                                onClick={() => updateConfigValue('telegram_sync_require_image', 'true')}
                                className="admin-choice-button"
                                data-state={telegramSyncRequireImage ? 'selected' : 'idle'}
                              >
                                必须有图
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSectionId === 'template' && (
                  <div className="admin-section-card">
                    <div className="space-y-6">
                      <h5 className="admin-text-title-sm">消息模板</h5>
                      <div className="space-y-2">
                        <label className="admin-field-label admin-field-label--section">同步模板（消息正文）</label>
                        <textarea
                          className="admin-form-control admin-form-control--muted admin-form-control--textarea admin-form-control--textarea-lg"
                          value={localConfig?.telegram_share_template || ''}
                          onChange={(e) => updateConfigValue('telegram_share_template', e.target.value)}
                          placeholder="支持变量：{contentLine}{authorLine}{contactLine}{sourceLine}{categoryLine}{shareUrl}"
                        />
                        <div className="admin-form-note admin-form-note--compact">
                          变量说明：
                          {` {contentLine}：正文文本`}
                          {`、{authorLine}：作者昵称`}
                          {`、{contactLine}：Telegram 联系方式（无联系方式时为空）`}
                          {`、{sourceLine}：站点来源`}
                          {`、{categoryLine}：分类 hashtag`}
                          {`、{shareUrl}：可点击的“查看详情”链接`}
                        </div>
                        <p className="admin-form-note admin-form-note--compact mt-2">
                          发送逻辑：模板中变量所在行若值为空会整行移除；未写 {`{shareUrl}`} 时系统会自动在末尾补“查看详情”。多图优先按 Telegram 相册发送，单图优先按图片消息发送；图片文件上传失败时会再用公开图片地址重试。仅当「勾选同步」且满足上方过滤条件（最少正文字数/是否有图）才会实际推送。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {configSectionId === 'reward' && (
                  <div className="admin-section-card">
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="admin-field-label admin-field-label--section admin-field-label--block">注册奖励积分</label>
                          <input
                            type="number"
                            inputMode="decimal"
                            className="admin-form-control admin-form-control--large admin-form-control--muted"
                            value={localConfig?.signup_reward_points ?? ''}
                            onChange={(e) => updateConfigValue('signup_reward_points', Number(e.target.value))}
                          />
                        </div>
                        <div className="admin-config-surface">
                          <div className="mb-3">
                            <h5 className="admin-text-title-sm">在线人数展示</h5>
                            <p className="mt-1 admin-form-note">
                              北京时间 08:00-次日 03:00 靠近最大值，其余时间靠近最小值。
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <ConfigItem
                              label="最小在线人数"
                              value={localConfig?.online_users_min ?? 380}
                              onChange={(v) => updateConfigValue('online_users_min', Number(v) || 0)}
                            />
                            <ConfigItem
                              label="最大在线人数"
                              value={localConfig?.online_users_max ?? 6800}
                              onChange={(v) => updateConfigValue('online_users_max', Number(v) || 0)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSectionId === 'location-presets' && (
                  <div className="admin-section-card">
                    <div className="space-y-8">
                      <div className="admin-config-surface">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <h5 className="admin-text-title-sm">发布地点预设</h5>
                            <p className="mt-1 admin-form-note">
                              按国家维护主要城市，发布页地点选择会直接使用这里的配置。
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={addLocationPreset}
                            className="admin-inline-primary-button"
                          >
                            <Plus size={14} />
                            添加国家
                          </button>
                        </div>
                        <div className="space-y-3">
                          {locationPresets.map((preset, index) => (
                            <div key={`${preset.country}-${index}`} className="admin-config-card">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="admin-index-badge admin-field-label">
                                    {String(index + 1).padStart(2, '0')}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate admin-text-title-sm">{preset.country}</div>
                                    <div className="admin-card-kicker">
                                      {preset.cities.length} 个城市
                                    </div>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveLocationPreset(index, -1)}
                                    disabled={index === 0}
                                    className="admin-icon-action"
                                    aria-label="上移"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveLocationPreset(index, 1)}
                                    disabled={index === locationPresets.length - 1}
                                    className="admin-icon-action"
                                    aria-label="下移"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeLocationPreset(index)}
                                    className="admin-danger-icon-action"
                                    aria-label="删除"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <label className="admin-field-label">
                                  国家
                                  <input
                                    className="mt-1 admin-form-control admin-form-control--field admin-form-control--field-muted"
                                    value={preset.country}
                                    onChange={(e) => updateLocationPreset(index, { country: e.target.value })}
                                  />
                                </label>
                                <label className="admin-field-label sm:col-span-2">
                                  城市，每行一个
                                  <textarea
                                    className="mt-1 admin-form-control admin-form-control--muted admin-form-control--textarea"
                                    value={preset.cities.join('\n')}
                                    onChange={(e) => updateLocationPreset(index, {
                                      cities: e.target.value.split('\n').map((city) => city.trim()).filter(Boolean),
                                    })}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 admin-note-panel admin-form-note">
                          当前共 {locationPresets.length} 个国家；保存后发布页地点选择会即时读取。
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSectionId === 'publish-category' && (
                  <div className="admin-section-card">
                    <div className="admin-config-surface admin-config-surface--comfortable">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                    <h5 className="admin-text-title-sm">发布分类附加字段</h5>
                    <p className="mt-1 admin-form-note">
                    前台发布页只展示这里配置的分类；字段会由服务端统一校验。
                    </p>
                    </div>
                    <button
                    type="button"
                    onClick={addPublishCategory}
                    className="admin-inline-primary-button"
                    >
                    <Plus size={14} />
                    添加分类
                    </button>
                    </div>
                    
                    <div className="space-y-4">
                    {publishCategorySchema.map((category, categoryIndex) => {
                    const selectedCategorySlug = category.categorySlug || category.slug || '';
                    const selectedCategory = (categories || []).find((item) => (
                    (selectedCategorySlug && (item.slug === selectedCategorySlug || item.id === selectedCategorySlug)) ||
                    (category.id && item.id === category.id)
                    ));
                    const selectedCategoryValue = selectedCategory?.slug || selectedCategory?.id || '';
                    return (
                    <div key={`${category.name || category.slug || category.id}-${categoryIndex}`} className="admin-config-card sm:p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                    <span className="admin-index-badge admin-field-label">
                    {String(categoryIndex + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                    <div className="truncate admin-text-title-sm">{category.name || category.slug || category.id || '未命名分类'}</div>
                    <div className="admin-card-kicker">
                    {category.slug || category.id || '按名称匹配'}
                    </div>
                    </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                    <button
                    type="button"
                    onClick={() => movePublishCategory(categoryIndex, -1)}
                    disabled={categoryIndex === 0}
                    className="admin-icon-action"
                    aria-label="上移"
                    >
                    <ArrowUp size={14} />
                    </button>
                    <button
                    type="button"
                    onClick={() => movePublishCategory(categoryIndex, 1)}
                    disabled={categoryIndex === publishCategorySchema.length - 1}
                    className="admin-icon-action"
                    aria-label="下移"
                    >
                    <ArrowDown size={14} />
                    </button>
                    <button
                    type="button"
                    onClick={() => removePublishCategory(categoryIndex)}
                    className="admin-danger-icon-action"
                    aria-label="删除"
                    >
                    <Trash2 size={14} />
                    </button>
                    </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="admin-field-label">
                    绑定数据库分类
                    <select
                    className="mt-1 admin-form-control admin-form-control--field admin-form-control--field-muted"
                    value={selectedCategoryValue}
                    onChange={(e) => {
                    const matched = (categories || []).find((item) => (item.slug || item.id) === e.target.value || item.id === e.target.value);
                    updatePublishCategory(categoryIndex, matched
                    ? { id: matched.id, categorySlug: matched.slug, slug: matched.slug, name: matched.name }
                    : { id: '', categorySlug: '', slug: '', name: category.name || '' });
                    }}
                    >
                    <option value="">按名称/slug 手动匹配</option>
                    {[...(categories || [])]
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map((item) => (
                    <option key={item.id} value={item.slug || item.id}>{item.name}</option>
                    ))}
                    </select>
                    </label>
                    <label className="admin-field-label">
                    数据库分类名
                    <input
                    className="mt-1 admin-form-control admin-form-control--field admin-form-control--field-muted"
                    value={selectedCategory?.name || category.name || ''}
                    readOnly
                    placeholder="招聘"
                    />
                    </label>
                    <label className="admin-field-label">
                    slug
                    <input
                    className="mt-1 admin-form-control admin-form-control--field admin-form-control--field-muted"
                    value={category.slug || ''}
                    onChange={(e) => updatePublishCategory(categoryIndex, { id: '', categorySlug: '', slug: e.target.value })}
                    placeholder="jobs"
                    />
                    </label>
                    </div>
                    
                    <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                    <p className="admin-field-label admin-field-label--section">附加字段</p>
                    <button
                    type="button"
                    onClick={() => addPublishCategoryField(categoryIndex)}
                    className="admin-table-action admin-table-action--compact admin-table-action--outline admin-table-action--with-icon"
                    >
                    <Plus size={13} />
                    添加字段
                    </button>
                    </div>
                    
                    {(category.fields || []).map((field, fieldIndex) => {
                    const fieldOptionsText = Array.isArray(field.options) ? field.options.join('\n') : '';
                    return (
                    <div key={`${field.key}-${fieldIndex}`} className="admin-config-field-card">
                    <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="admin-text-strong-xs">字段 {fieldIndex + 1}</div>
                    <button
                    type="button"
                    onClick={() => removePublishCategoryField(categoryIndex, fieldIndex)}
                    className="admin-danger-icon-action"
                    aria-label="删除字段"
                    >
                    <Trash2 size={13} />
                    </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <label className="admin-field-label">
                    字段名
                    <input
                    className="mt-1 admin-form-control admin-form-control--field"
                    value={field.key}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { key: e.target.value })}
                    placeholder="position"
                    />
                    </label>
                    <label className="admin-field-label">
                    展示名称
                    <input
                    className="mt-1 admin-form-control admin-form-control--field"
                    value={field.label}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { label: e.target.value })}
                    placeholder="岗位"
                    />
                    </label>
                    <label className="admin-field-label">
                    类型
                    <select
                    className="mt-1 admin-form-control admin-form-control--field"
                    value={field.type}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { type: e.target.value as PublishCategoryFieldType })}
                    >
                    {PUBLISH_CATEGORY_FIELD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                    </select>
                    </label>
                    <label className="admin-field-checkbox-label">
                    <input
                    type="checkbox"
                    checked={Boolean(field.required)}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { required: e.target.checked })}
                    className="h-3.5 w-3.5 accent-gray-900"
                    />
                    必填
                    </label>
                    </div>
                    
                    {field.type === 'text' ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <label className="admin-field-label">
                    最大字数
                    <input
                    type="number"
                    className="mt-1 admin-form-control admin-form-control--field"
                    value={field.maxLength ?? 80}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { maxLength: Number(e.target.value) || 80 })}
                    />
                    </label>
                    </div>
                    ) : null}
                    
                    {field.type === 'number' ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <label className="admin-field-label">
                    最小值
                    <input
                    type="number"
                    className="mt-1 admin-form-control admin-form-control--field"
                    value={field.min ?? ''}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                    </label>
                    <label className="admin-field-label">
                    最大值
                    <input
                    type="number"
                    className="mt-1 admin-form-control admin-form-control--field"
                    value={field.max ?? ''}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                    </label>
                    </div>
                    ) : null}
                    
                    {field.type === 'select' ? (
                    <label className="mt-2 block admin-field-label">
                    下拉选项，每行一个
                    <textarea
                    className="mt-1 admin-form-control admin-form-control--textarea admin-form-control--textarea-sm"
                    value={fieldOptionsText}
                    onChange={(e) => updatePublishCategoryField(categoryIndex, fieldIndex, {
                    options: e.target.value.split('\n'),
                    })}
                    placeholder={'选项 A\n选项 B'}
                    />
                    </label>
                    ) : null}
                    </div>
                    );
                    })}
                    </div>
                    </div>
                    );
                    })}
                    </div>
                    </div>
                  </div>
                )}

                {configSectionId === 'recharge' && (
                  <div className="admin-section-card">
                    <div className="space-y-8">
                      <div className="admin-config-surface admin-config-surface--comfortable xl:min-w-0">
                        <div className="mb-4">
                          <h5 className="admin-text-title-sm">自动充值配置</h5>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <ConfigItem
                            label="每 1 USDT 兑换积分"
                            value={localConfig?.recharge_points_per_usdt ?? 10}
                            onChange={(v) => updateConfigValue('recharge_points_per_usdt', Number(v) || 10)}
                          />
                          <ConfigItem
                            label="最低入账 USDT"
                            value={localConfig?.tron_deposit_min_usdt ?? 1}
                            onChange={(v) => updateConfigValue('tron_deposit_min_usdt', Number(v) || 0)}
                          />
                          <ConfigItem
                            label="扫描间隔秒"
                            value={localConfig?.tron_deposit_scan_interval_seconds ?? 20}
                            onChange={(v) => updateConfigValue('tron_deposit_scan_interval_seconds', Number(v) || 20)}
                          />
                          <ConfigItem
                            label="扫描窗口分钟"
                            value={localConfig?.tron_deposit_scan_window_minutes ?? 30}
                            onChange={(v) => updateConfigValue('tron_deposit_scan_window_minutes', Number(v) || 30)}
                          />
                          <ConfigItem
                            label="最大扫描次数"
                            value={localConfig?.tron_deposit_scan_max_attempts ?? 90}
                            onChange={(v) => updateConfigValue('tron_deposit_scan_max_attempts', Number(v) || 90)}
                          />
                          <div className="space-y-2">
                            <label className="admin-field-label admin-field-label--section">链上扫描</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => updateConfigValue('tron_deposit_scan_enabled', 'true')}
                                className="admin-config-choice"
                                data-state={String(localConfig?.tron_deposit_scan_enabled ?? 'true') === 'true' ? 'active' : 'idle'}
                              >
                                开启
                              </button>
                              <button
                                type="button"
                                onClick={() => updateConfigValue('tron_deposit_scan_enabled', 'false')}
                                className="admin-config-choice"
                                data-state={String(localConfig?.tron_deposit_scan_enabled ?? 'true') !== 'true' ? 'active' : 'idle'}
                              >
                                关闭
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <label className="admin-field-label admin-field-label--section admin-field-label--block">TRC20-USDT 合约地址</label>
                            <input
                              type="text"
                              className="admin-form-control admin-form-control--large"
                              value={localConfig?.tron_usdt_contract ?? ''}
                              onChange={(e) => updateConfigValue('tron_usdt_contract', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <label className="admin-field-label admin-field-label--section admin-field-label--block">兜底收款地址</label>
                            <input
                              type="text"
                              className="admin-form-control admin-form-control--large"
                              value={localConfig?.tron_deposit_fallback_address ?? ''}
                              onChange={(e) => updateConfigValue('tron_deposit_fallback_address', e.target.value)}
                              placeholder="地址池用尽时展示，不自动到账"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <label className="admin-field-label admin-field-label--section admin-field-label--block">归集目标地址</label>
                            <input
                              type="text"
                              className="admin-form-control admin-form-control--large"
                              value={localConfig?.tron_sweep_target_address ?? ''}
                              onChange={(e) => updateConfigValue('tron_sweep_target_address', e.target.value)}
                              placeholder="自动归集只允许转入这个固定地址"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
    </>
  );
}
