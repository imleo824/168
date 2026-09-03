import React, { useMemo } from 'react';
import { Check, ChevronRight, MapPin } from 'lucide-react';
import type { PublishCategoryMetaConfig } from '@/types';
import { CATEGORY_META_TEXT_MAX_LENGTH } from './postCreateConstants';
import {
  getCategoryMetaFieldKey,
  getOrderedCategoryMetaFields,
  isCategoryMetaLocationField,
  isCategoryMetaMoneyNumberField,
  normalizeConfigText,
  summarizeCategoryMetaValue,
} from './postCreateCategoryMeta';
import { formatCreateTopicLabel, normalizeCreateTopicName } from './postCreateTopic';

export function PostCreateSwitch({ checked }: { checked: boolean }) {
  return (
    <span className="post-create-switch-track" data-state={checked ? 'on' : 'off'} aria-hidden="true">
      <span className="post-create-switch-thumb" />
    </span>
  );
}

type CategoryMetaFieldRowProps = {
  key?: React.Key;
  field: PublishCategoryMetaConfig['fields'][number];
  value: string;
  highlight: boolean;
  onChange: (key: string, value: string) => void;
  onOpenLocation: (key: string, label: string) => void;
  onOpenSelect: (key: string, label: string, options: string[]) => void;
};

function CategoryMetaFieldRow({
  field,
  value,
  highlight,
  onChange,
  onOpenLocation,
  onOpenSelect,
}: CategoryMetaFieldRowProps) {
  const fieldKey = getCategoryMetaFieldKey(field);
  const fieldLabel = field.label || fieldKey;
  const fieldId = `category-meta-${fieldKey}`;
  const isRequired = Boolean(field.required);
  const isLocationField = isCategoryMetaLocationField(field);
  const isMoneyNumberField = isCategoryMetaMoneyNumberField(field);
  const selectOptions = Array.isArray(field.options)
    ? field.options.map((option) => normalizeConfigText(option)).filter(Boolean)
    : [];
  const summary = summarizeCategoryMetaValue(field, value);

  if (!fieldKey) return null;

  return (
    <div
      className={[
        'post-create-meta-field-row',
        summary ? 'post-create-meta-field-row--filled' : 'post-create-meta-field-row--empty',
        highlight ? 'post-create-meta-field-row--error' : '',
      ].filter(Boolean).join(' ')}
      data-field-key={fieldKey}
    >
      <div className="post-create-meta-field-copy">
        <label className="post-create-meta-field-label" htmlFor={fieldId}>
          <span>{fieldLabel}</span>
          {isRequired ? <em aria-label="必填" title="必填">*</em> : null}
        </label>
      </div>

      <div className="post-create-meta-field-control">
        {isLocationField ? (
          <button
            id={fieldId}
            type="button"
            className="post-create-meta-picker-button"
            onClick={() => onOpenLocation(fieldKey, fieldLabel)}
          >
            <span>{summary || `请选择${fieldLabel}`}</span>
            <MapPin className="post-create-meta-control-icon" aria-hidden="true" />
          </button>
        ) : null}

        {field.type === 'text' && !isLocationField ? (
          <input
            id={fieldId}
            type="text"
            className="post-create-meta-inline-input"
            value={value}
            onChange={(event) => {
              onChange(fieldKey, event.target.value.slice(0, field.maxLength || CATEGORY_META_TEXT_MAX_LENGTH));
            }}
            placeholder={`请输入${fieldLabel}`}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={field.maxLength || CATEGORY_META_TEXT_MAX_LENGTH}
          />
        ) : null}

        {field.type === 'number' ? (
          <span className={isMoneyNumberField ? 'post-create-meta-number-wrap post-create-meta-number-wrap--money' : 'post-create-meta-number-wrap'}>
            <input
              id={fieldId}
              type="number"
              inputMode="numeric"
              className="post-create-meta-inline-input post-create-meta-inline-input--number"
              value={value}
              onChange={(event) => onChange(fieldKey, event.target.value)}
              placeholder="0"
              min={Number.isFinite(field.min as number) ? field.min : undefined}
              max={Number.isFinite(field.max as number) ? field.max : undefined}
            />
            {isMoneyNumberField ? <span className="post-create-meta-number-unit" aria-hidden="true">$</span> : null}
          </span>
        ) : null}

        {field.type === 'boolean' ? (
          <div className="post-create-meta-segmented" role="radiogroup" aria-label={fieldLabel}>
            {[
              { value: 'true', label: '是' },
              { value: 'false', label: '否' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className="post-create-meta-segment"
                data-state={value === option.value ? 'on' : 'off'}
                role="radio"
                aria-checked={value === option.value}
                onClick={() => onChange(fieldKey, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {field.type === 'select' ? (
          <button
            id={fieldId}
            type="button"
            className="post-create-meta-picker-button"
            onClick={() => onOpenSelect(fieldKey, fieldLabel, selectOptions)}
            disabled={selectOptions.length === 0}
          >
            <span>{summary || `请选择${fieldLabel}`}</span>
            <ChevronRight className="post-create-meta-control-icon" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type CategoryMetaCardProps = {
  categoryLabel: string;
  fields: PublishCategoryMetaConfig['fields'];
  values: Record<string, string>;
  firstErrorKey: string;
  onChange: (key: string, value: string) => void;
  onOpenLocation: (key: string, label: string) => void;
  onOpenSelect: (key: string, label: string, options: string[]) => void;
  cardRef?: React.RefObject<HTMLElement | null>;
};

export function CategoryMetaCard({
  categoryLabel,
  fields,
  values,
  firstErrorKey,
  onChange,
  onOpenLocation,
  onOpenSelect,
  cardRef,
}: CategoryMetaCardProps) {
  const orderedFields = useMemo(() => getOrderedCategoryMetaFields(fields), [fields]);

  return (
    <section ref={cardRef} className="post-create-meta-card post-create-meta-card--compact" aria-label={`${categoryLabel}信息`}>
      <div className="post-create-meta-card-body">
        {orderedFields.map((field) => {
          const fieldKey = getCategoryMetaFieldKey(field);
          return (
            <CategoryMetaFieldRow
              key={fieldKey}
              field={field}
              value={values[fieldKey] || ''}
              highlight={firstErrorKey === fieldKey}
              onChange={onChange}
              onOpenLocation={onOpenLocation}
              onOpenSelect={onOpenSelect}
            />
          );
        })}
      </div>
    </section>
  );
}

export function CategoryPickerOption({
  category,
  selected,
  onSelect,
}: {
  key?: React.Key;
  category: any;
  selected: boolean;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={selected ? `已选分类：${formatCreateTopicLabel(category.name)}` : `选择分类：${formatCreateTopicLabel(category.name)}`}
      onClick={() => onSelect(category.id)}
      role="option"
      aria-selected={selected}
      className="post-create-location-option"
      data-state={selected ? 'on' : 'off'}
    >
      <span className="post-create-location-option-mark" aria-hidden="true">
        {selected ? <Check className="post-create-location-option-icon post-create-location-option-icon--selected" /> : null}
      </span>
      <span className="post-create-location-option-copy">
        <span className="post-create-location-option-text">{normalizeCreateTopicName(category.name)}</span>
      </span>
    </button>
  );
}
