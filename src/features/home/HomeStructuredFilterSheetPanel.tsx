import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BottomSheet from '@/ui/BottomSheet';
import type {
  CategoryMetaFeedFilters,
  CategoryMetaFeedFilterValue,
  LocationPresetConfig,
  PublishCategoryMetaConfig,
} from '@/types';
import type { HomeTopicTabId } from './HomeTopicTabs';
import {
  HOUSING_PRICE_RANGE_OPTIONS,
  areRangesEqual,
  getFieldKey,
  getFieldLabel,
  getLocationSelectedCountry,
  getRangeDraft,
  getVisibleHomeStructuredFilterFields,
  isHousingPriceFilterField,
  isLocationField,
  isSingleMinimumNumberFilterField,
  normalizeDraftFilters,
  normalizeLocationGroups,
  normalizeText,
  setMinimumNumberDraft,
  setRangeDraft,
  type DraftFilters,
} from './homeStructuredFilterUtils';

interface HomeStructuredFilterSheetPanelProps {
  open: boolean;
  tabId: HomeTopicTabId;
  schema: PublishCategoryMetaConfig | null;
  value: CategoryMetaFeedFilters;
  locationPresets: LocationPresetConfig[];
  focusFieldKey?: string;
  onClose: () => void;
  onApply: (filters: CategoryMetaFeedFilters) => void;
}

export const HomeStructuredFilterSheetPanel = memo(function HomeStructuredFilterSheetPanel({
  open,
  tabId,
  schema,
  value,
  locationPresets,
  focusFieldKey = '',
  onClose,
  onApply,
}: HomeStructuredFilterSheetPanelProps) {
  const [draft, setDraft] = useState<DraftFilters>({});
  const [error, setError] = useState('');
  const [selectedLocationCountries, setSelectedLocationCountries] = useState<Record<string, string>>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const fields = useMemo(() => getVisibleHomeStructuredFilterFields(schema), [schema]);
  const locationGroups = useMemo(() => normalizeLocationGroups(locationPresets), [locationPresets]);
  const focusedField = useMemo(
    () => fields.find((field) => getFieldKey(field) === focusFieldKey) || null,
    [fields, focusFieldKey],
  );
  const displayedFields = focusedField ? [focusedField] : fields;
  const title = focusedField
    ? '筛选'
    : schema?.name ? `${schema.name}筛选` : '筛选';

  const registerFieldRef = useCallback((key: string) => (node: HTMLElement | null) => {
    if (node) {
      fieldRefs.current[key] = node;
      return;
    }
    delete fieldRefs.current[key];
  }, []);

  useEffect(() => {
    if (!open) return;
    const nextDraft = value || {};
    setDraft(nextDraft);
    setSelectedLocationCountries(() => {
      const next: Record<string, string> = {};
      fields.forEach((field) => {
        if (!isLocationField(field)) return;
        const key = getFieldKey(field);
        if (!key) return;
        next[key] = getLocationSelectedCountry(nextDraft[key], locationGroups);
      });
      return next;
    });
    setError('');
  }, [fields, locationGroups, open, tabId, value]);

  const updateDraftValue = useCallback((key: string, nextValue: CategoryMetaFeedFilterValue | undefined) => {
    setDraft((current) => {
      const next = { ...current };
      if (nextValue === undefined || nextValue === '') {
        delete next[key];
      } else {
        next[key] = nextValue;
      }
      return next;
    });
    setError('');
  }, []);

  const handleApply = useCallback(() => {
    const normalized = normalizeDraftFilters(fields, draft);
    if (normalized.errors.length > 0) {
      setError(normalized.errors[0]);
      return;
    }
    onApply(normalized.filters);
    onClose();
  }, [draft, fields, onApply, onClose]);

  const handleReset = useCallback(() => {
    if (focusFieldKey) {
      const nextDraft = { ...draft };
      delete nextDraft[focusFieldKey];
      const normalized = normalizeDraftFilters(fields, nextDraft);
      if (normalized.errors.length > 0) {
        setError(normalized.errors[0]);
        return;
      }
      setDraft(nextDraft);
      setError('');
      onApply(normalized.filters);
      onClose();
      return;
    }

    setDraft({});
    setError('');
    onApply({});
    onClose();
  }, [draft, fields, focusFieldKey, onApply, onClose]);

  useEffect(() => {
    if (!open || !focusFieldKey) return;
    const timer = window.setTimeout(() => {
      const target = fieldRefs.current[focusFieldKey];
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusFieldKey, open]);

  return (
    <BottomSheet
      open={open}
      title={title}
      ariaLabel={title}
      onClose={onClose}
      overlayClassName="home-structured-filter-overlay"
      panelClassName="ui-sheet-panel home-structured-filter-sheet"
      bodyClassName="home-structured-filter-body"
    >
      <div className="home-structured-filter-stack">
        {displayedFields.length === 0 ? (
          <div className="home-structured-filter-empty">
            当前分类暂时没有可用筛选项
          </div>
        ) : null}

        {displayedFields.map((field, fieldIndex) => {
          const key = getFieldKey(field);
          if (!key) return null;
          const label = getFieldLabel(field);
          const rawValue = draft[key];
          const isTerminalField = fieldIndex === displayedFields.length - 1;
          const fieldRef = registerFieldRef(key);

          if (isLocationField(field)) {
            const selectedValue = typeof rawValue === 'string' ? rawValue : '';
            const selectedCountry = selectedLocationCountries[key] || getLocationSelectedCountry(selectedValue, locationGroups);
            const activeLocationGroup = locationGroups.find((group) => group.country === selectedCountry) || locationGroups[0] || null;
            return (
              <section ref={fieldRef} key={key} className="home-structured-filter-group" aria-label={label} data-home-filter-field={key} data-home-filter-terminal={isTerminalField ? 'true' : 'false'} tabIndex={-1}>
                {locationGroups.length > 0 ? (
                  <>
                    <div className="home-structured-location-country-row" role="listbox" aria-label="选择国家">
                      {locationGroups.map((group) => {
                        const selected = group.country === selectedCountry;
                        return (
                          <button
                            key={group.country}
                            type="button"
                            className="home-structured-location-country-option"
                            data-state={selected ? 'on' : 'off'}
                            aria-selected={selected}
                            role="option"
                            onClick={() => setSelectedLocationCountries((current) => ({ ...current, [key]: group.country }))}
                          >
                            {group.country}
                          </button>
                        );
                      })}
                    </div>
                    <div className="home-structured-location-grid" aria-label={activeLocationGroup ? `${activeLocationGroup.country}城市` : '城市'}>
                      {activeLocationGroup?.cities.map((option) => {
                        const selected = selectedValue === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className="home-structured-location-option"
                            data-state={selected ? 'on' : 'off'}
                            aria-pressed={selected}
                            onClick={() => updateDraftValue(key, selected ? undefined : option.value)}
                          >
                            <span className="home-structured-location-city">{option.city}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="home-structured-filter-empty">
                    当前暂无可选地点
                  </div>
                )}
              </section>
            );
          }

          if (field.type === 'select') {
            const options = Array.isArray(field.options)
              ? field.options.map((item) => normalizeText(item, 40)).filter(Boolean)
              : [];
            const selectedValue = typeof rawValue === 'string' ? rawValue : '';
            return (
              <section ref={fieldRef} key={key} className="home-structured-filter-group" aria-label={label} data-home-filter-field={key} data-home-filter-terminal={isTerminalField ? 'true' : 'false'} tabIndex={-1}>
                <div className="home-structured-chip-grid">
                  {options.map((option) => {
                    const selected = selectedValue === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        className="home-structured-filter-chip"
                        data-state={selected ? 'on' : 'off'}
                        aria-pressed={selected}
                        onClick={() => updateDraftValue(key, selected ? undefined : option)}
                      >
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          }

          if (field.type === 'boolean') {
            return (
              <section ref={fieldRef} key={key} className="home-structured-filter-group" aria-label={label} data-home-filter-field={key} data-home-filter-terminal={isTerminalField ? 'true' : 'false'} tabIndex={-1}>
                <div className="home-structured-segmented" role="radiogroup" aria-label={label}>
                  {[
                    { label: '是', value: true },
                    { label: '否', value: false },
                  ].map((option) => {
                    const selected = rawValue === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        className="home-structured-segment"
                        data-state={selected ? 'on' : 'off'}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => updateDraftValue(key, selected ? undefined : option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          }

          if (field.type === 'number') {
            if (isHousingPriceFilterField(schema, field)) {
              return (
                <section ref={fieldRef} key={key} className="home-structured-filter-group" aria-label={label} data-home-filter-field={key} data-home-filter-terminal={isTerminalField ? 'true' : 'false'} tabIndex={-1}>
                  <div className="home-structured-chip-grid home-structured-price-grid">
                    {HOUSING_PRICE_RANGE_OPTIONS.map((option) => {
                      const selected = areRangesEqual(rawValue, option.value);
                      return (
                        <button
                          key={option.label}
                          type="button"
                          className="home-structured-filter-chip"
                          data-state={selected ? 'on' : 'off'}
                          aria-pressed={selected}
                          onClick={() => updateDraftValue(key, selected ? undefined : { ...option.value })}
                        >
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            }

            const range = getRangeDraft(rawValue);
            const isMinimumOnly = isSingleMinimumNumberFilterField(field);
            return (
              <section ref={fieldRef} key={key} className="home-structured-filter-group" aria-label={label} data-home-filter-field={key} data-home-filter-terminal={isTerminalField ? 'true' : 'false'} tabIndex={-1}>
                <div className="home-structured-range-row" data-mode={isMinimumOnly ? 'minimum' : 'range'}>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="home-structured-range-input"
                    value={range.min}
                    placeholder={isMinimumOnly ? '数量' : '最低'}
                    min={field.min}
                    max={field.max}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setDraft((current) => isMinimumOnly
                        ? setMinimumNumberDraft(current, key, nextValue)
                        : setRangeDraft(current, key, 'min', nextValue));
                      setError('');
                    }}
                  />
                  {!isMinimumOnly ? (
                    <>
                      <span className="home-structured-range-separator" aria-hidden="true" />
                      <input
                        type="number"
                        inputMode="numeric"
                        className="home-structured-range-input"
                        value={range.max}
                        placeholder="最高"
                        min={field.min}
                        max={field.max}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setDraft((current) => setRangeDraft(current, key, 'max', nextValue));
                          setError('');
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </section>
            );
          }

          const textValue = typeof rawValue === 'string' ? rawValue : '';
          return (
            <section ref={fieldRef} key={key} className="home-structured-filter-group" aria-label={label} data-home-filter-field={key} data-home-filter-terminal={isTerminalField ? 'true' : 'false'} tabIndex={-1}>
              <input
                type="text"
                className="home-structured-text-input"
                value={textValue}
                placeholder={label}
                maxLength={field.maxLength || 120}
                onChange={(event) => updateDraftValue(key, event.target.value)}
              />
            </section>
          );
        })}

        {error ? <div className="home-structured-filter-error">{error}</div> : null}

        <div className="home-structured-filter-actions">
          <button type="button" className="home-structured-filter-reset pressable" onClick={handleReset}>
            重置
          </button>
          <button type="button" className="home-structured-filter-apply pressable" onClick={handleApply}>
            完成
          </button>
        </div>
      </div>
    </BottomSheet>
  );
});

export default HomeStructuredFilterSheetPanel;
