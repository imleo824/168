import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, MapPin } from 'lucide-react';
import { useConfig } from '@/hooks/useDataConfig';
import ActionButton from '@/ui/ActionButton';
import type { PublishCategoryMetaConfig } from '@/types';
import {
  buildLocationOptionsFromPresets,
  normalizeLocationPresets,
  type PostCreateLocationOption,
} from './postCreateLocation';
import { CategoryMetaCard, CategoryPickerOption } from './postCreateComponents';

type PostCreateLocationGroup = {
  country: string;
  options: PostCreateLocationOption[];
};

function resolveConfiguredLocationOptions(rawPresets: unknown, fallbackOptions: PostCreateLocationOption[]) {
  const configuredPresets = normalizeLocationPresets(rawPresets);
  if (configuredPresets.length === 0) return fallbackOptions;

  const configuredOptions = buildLocationOptionsFromPresets(
    configuredPresets,
    '',
    Number.MAX_SAFE_INTEGER,
    true,
  );
  return configuredOptions.length > 0 ? configuredOptions : fallbackOptions;
}

function groupPostCreateLocationOptions(options: PostCreateLocationOption[]) {
  const groupMap = new Map<string, PostCreateLocationOption[]>();
  options.forEach((option) => {
    const country = String(option.country || '').trim();
    if (!country) return;
    const current = groupMap.get(country) || [];
    if (!current.some((item) => item.value === option.value)) {
      current.push(option);
    }
    groupMap.set(country, current);
  });

  return Array.from(groupMap.entries()).map(([country, groupedOptions]) => ({
    country,
    options: groupedOptions,
  }));
}

function resolvePostCreateLocationCountry(
  selectedValue: string,
  groups: PostCreateLocationGroup[],
) {
  const selectedOption = groups
    .flatMap((group) => group.options)
    .find((option) => option.value === selectedValue);
  return selectedOption?.country || groups[0]?.country || '';
}

function resolvePostCreateLocationLabel(selectedValue: string, groups: PostCreateLocationGroup[]) {
  const selectedOption = groups
    .flatMap((group) => group.options)
    .find((option) => option.value === selectedValue);
  return selectedOption ? `${selectedOption.country} · ${selectedOption.city}` : selectedValue;
}

function PostCreatePickerPageShell({
  title,
  description,
  ariaLabel,
  onClose,
  rightAction,
  children,
}: {
  title: string;
  description?: string;
  ariaLabel: string;
  onClose: () => void;
  rightAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="post-create-picker-page-overlay" role="presentation">
      <section
        className="post-create-picker-page-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <header className="post-create-picker-page-header">
          <button
            type="button"
            className="post-create-picker-page-close"
            aria-label={`关闭${title}`}
            onClick={onClose}
          >
            <ArrowLeft className="post-create-picker-page-close-icon" aria-hidden="true" />
          </button>
          <div className="post-create-picker-page-heading">
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <div className="post-create-picker-page-action">
            {rightAction || <span className="post-create-picker-page-action-placeholder" aria-hidden="true" />}
          </div>
        </header>
        <div className="post-create-picker-page-body">
          {children}
        </div>
      </section>
    </div>
  );
}

export function PostCreateCategoryPickerSheet({
  open,
  categories,
  selectedCategoryId,
  onClose,
  onClear,
  onSelect,
}: {
  open: boolean;
  categories: any[];
  selectedCategoryId: string;
  onClose: () => void;
  onClear: () => void;
  onSelect: (categoryId: string) => void;
  onSave?: () => void;
}) {
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) || null;
  const selectedCategoryLabel = String(selectedCategory?.name || '').trim();

  if (!open) return null;

  return (
    <PostCreatePickerPageShell
      title="选择分类"
      description="选择合适的分类，内容将展示在对应专属频道"
      ariaLabel="选择分类"
      onClose={onClose}
    >
      <div data-post-create-stable-focus="true" className="post-create-stable-focus post-create-location-picker post-create-picker-field-page">
        {selectedCategoryLabel ? (
          <div className="post-create-category-current-card" aria-live="polite">
            <div className="post-create-category-current-copy">
              <span className="post-create-category-current-kicker">已选分类</span>
              <strong className="post-create-category-current-name">{selectedCategoryLabel}</strong>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="post-create-category-clear-button"
            >
              清除分类
            </button>
          </div>
        ) : null}

        <div className="post-create-location-results" role="listbox" aria-label="发布分类">
          {categories.length > 0 ? (
            <div className="post-create-location-city-grid" aria-label="分类">
              {categories.map((category) => (
                <CategoryPickerOption
                  key={category.id}
                  category={category}
                  selected={selectedCategoryId === category.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="post-create-location-empty">暂无可用的分类</div>
          )}
        </div>
      </div>
    </PostCreatePickerPageShell>
  );
}

export function PostCreateLocationPickerSheet({
  open,
  title,
  ariaLabel,
  selectedValue,
  options,
  onClose,
  onClear,
  onSelect,
  listAriaLabel = '地点',
}: {
  open: boolean;
  title: string;
  ariaLabel: string;
  selectedValue: string;
  options: PostCreateLocationOption[];
  onClose: () => void;
  onClear: () => void;
  onSelect: (value: string) => void;
  listAriaLabel?: string;
}) {
  const { data: config } = useConfig();
  const resolvedOptions = useMemo(
    () => resolveConfiguredLocationOptions((config as any)?.location_presets, options),
    [config, options],
  );
  const locationGroups = useMemo(() => groupPostCreateLocationOptions(resolvedOptions), [resolvedOptions]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const activeCountry = selectedCountry || resolvePostCreateLocationCountry(selectedValue, locationGroups);
  const activeGroup = locationGroups.find((group) => group.country === activeCountry) || locationGroups[0] || null;
  const selectedLabel = resolvePostCreateLocationLabel(selectedValue, locationGroups);

  useEffect(() => {
    if (!open) return;
    setSelectedCountry(resolvePostCreateLocationCountry(selectedValue, locationGroups));
  }, [locationGroups, open, selectedValue]);

  if (!open) return null;

  return (
    <PostCreatePickerPageShell
      title={title}
      description="选择所在国家及城市，方便同城用户发现"
      ariaLabel={ariaLabel}
      onClose={onClose}
    >
      <div data-post-create-stable-focus="true" className="post-create-stable-focus post-create-location-picker post-create-picker-field-page">
        {selectedValue ? (
          <div className="post-create-category-current-card" aria-live="polite">
            <div className="post-create-category-current-copy">
              <span className="post-create-category-current-kicker">已选地点</span>
              <strong className="post-create-category-current-name">{selectedLabel || '已选地点'}</strong>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="post-create-category-clear-button"
            >
              清除地点
            </button>
          </div>
        ) : null}

        <div className="post-create-location-results" role="listbox" aria-label={listAriaLabel}>
          {locationGroups.length > 0 ? (
            <>
              <div className="post-create-location-country-row" role="listbox" aria-label="选择国家">
                {locationGroups.map((group) => {
                  const selected = group.country === activeCountry;
                  return (
                    <button
                      key={group.country}
                      type="button"
                      className="post-create-location-country-option"
                      data-state={selected ? 'on' : 'off'}
                      role="option"
                      aria-selected={selected}
                      onClick={() => setSelectedCountry(group.country)}
                    >
                      {group.country}
                    </button>
                  );
                })}
              </div>

              <div className="post-create-location-city-grid" aria-label={activeGroup ? `${activeGroup.country}城市` : '城市'}>
                {activeGroup?.options.map((option) => {
                  const selected = selectedValue === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onSelect(option.value)}
                      className="post-create-location-option"
                      role="option"
                      aria-selected={selected}
                    >
                      <span className="post-create-location-option-mark" aria-hidden="true">
                        {selected ? (
                          <Check className="post-create-location-option-icon post-create-location-option-icon--selected" />
                        ) : (
                          <MapPin className="post-create-location-option-icon" />
                        )}
                      </span>
                      <span className="post-create-location-option-copy">
                        <span className="post-create-location-option-text">{option.city}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="post-create-location-empty">暂无可用的地点选项</div>
          )}
        </div>
      </div>
    </PostCreatePickerPageShell>
  );
}

export function PostCreateCategorySelectSheet({
  open,
  title,
  ariaLabel,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  ariaLabel: string;
  options: string[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  if (!open) return null;

  return (
    <PostCreatePickerPageShell
      title={title}
      description="请选择符合的一项"
      ariaLabel={ariaLabel}
      onClose={onClose}
    >
      <div data-post-create-stable-focus="true" className="post-create-stable-focus">
        <div className="post-create-location-results post-create-picker-option-grid" role="listbox" aria-label="结构化选项">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(option)}
              className="post-create-location-option"
              role="option"
              aria-selected={selectedValue === option}
            >
              <span className="post-create-location-option-mark" aria-hidden="true">
                {selectedValue === option ? <Check className="post-create-location-option-icon post-create-location-option-icon--selected" /> : null}
              </span>
              <span className="post-create-location-option-text">{option}</span>
            </button>
          ))}
        </div>
      </div>
    </PostCreatePickerPageShell>
  );
}

export function PostCreateCategoryMetaSheet({
  open,
  categoryLabel,
  fields,
  values,
  firstErrorKey,
  onClose,
  onChange,
  onOpenLocation,
  onOpenSelect,
  onSave,
  saveDisabled,
}: {
  open: boolean;
  categoryLabel: string;
  fields: PublishCategoryMetaConfig['fields'];
  values: Record<string, string>;
  firstErrorKey: string;
  onClose: () => void;
  onChange: (key: string, value: string) => void;
  onOpenLocation: (key: string, label: string) => void;
  onOpenSelect: (key: string, label: string, options: string[]) => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  const cardRef = useRef<HTMLElement | null>(null);

  if (!open || !categoryLabel || fields.length === 0) return null;

  return (
    <PostCreatePickerPageShell
      title={`${categoryLabel}信息`}
      description="完善分类属性，帮助读者更快获取关键信息"
      ariaLabel={`${categoryLabel}信息`}
      onClose={onClose}
      rightAction={(
        <ActionButton
          type="button"
          variant="brand"
          size="header"
          onClick={onSave}
          disabled={saveDisabled}
          className="post-create-picker-page-save"
        >
          保存
        </ActionButton>
      )}
    >
      <div data-post-create-stable-focus="true" className="post-create-stable-focus post-create-picker-field-page">
        <CategoryMetaCard
          cardRef={cardRef}
          categoryLabel={categoryLabel}
          fields={fields}
          values={values}
          firstErrorKey={firstErrorKey}
          onChange={onChange}
          onOpenLocation={onOpenLocation}
          onOpenSelect={onOpenSelect}
        />
      </div>
    </PostCreatePickerPageShell>
  );
}
