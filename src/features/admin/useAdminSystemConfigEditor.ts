import { useCallback } from 'react';
import type {
  LocationPresetConfig,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '@/types';
import {
  makeAdminPublishField,
  normalizeAdminLocationPresets,
  normalizeAdminPublishCategorySchema,
} from './adminConfigSchema';

type UseAdminSystemConfigEditorOptions = {
  localConfig: any;
  setLocalConfig: (updater: any) => void;
};

export function useAdminSystemConfigEditor({
  localConfig,
  setLocalConfig,
}: UseAdminSystemConfigEditorOptions) {
  const publishCategorySchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
  const locationPresets = normalizeAdminLocationPresets(localConfig?.location_presets);

  const setLocationPresets = useCallback((nextPresets: LocationPresetConfig[]) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      location_presets: nextPresets,
    }));
  }, [setLocalConfig]);

  const updateLocationPreset = useCallback((index: number, patch: Partial<LocationPresetConfig>) => {
    const nextPresets = normalizeAdminLocationPresets(localConfig?.location_presets);
    if (!nextPresets[index]) return;
    nextPresets[index] = { ...nextPresets[index], ...patch };
    setLocationPresets(nextPresets);
  }, [localConfig?.location_presets, setLocationPresets]);

  const moveLocationPreset = useCallback((index: number, direction: -1 | 1) => {
    const nextPresets = normalizeAdminLocationPresets(localConfig?.location_presets);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= nextPresets.length) return;
    const [item] = nextPresets.splice(index, 1);
    nextPresets.splice(targetIndex, 0, item);
    setLocationPresets(nextPresets);
  }, [localConfig?.location_presets, setLocationPresets]);

  const addLocationPreset = useCallback(() => {
    const nextPresets = normalizeAdminLocationPresets(localConfig?.location_presets);
    nextPresets.push({ country: '新国家', cities: ['新城市'] });
    setLocationPresets(nextPresets);
  }, [localConfig?.location_presets, setLocationPresets]);

  const removeLocationPreset = useCallback((index: number) => {
    const nextPresets = normalizeAdminLocationPresets(localConfig?.location_presets);
    nextPresets.splice(index, 1);
    setLocationPresets(nextPresets);
  }, [localConfig?.location_presets, setLocationPresets]);

  const setPublishCategorySchema = useCallback((nextSchema: PublishCategoryMetaConfig[]) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      publish_category_schema: nextSchema,
    }));
  }, [setLocalConfig]);

  const updatePublishCategory = useCallback((index: number, patch: Partial<PublishCategoryMetaConfig>) => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    if (!nextSchema[index]) return;
    nextSchema[index] = { ...nextSchema[index], ...patch };
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  const addPublishCategory = useCallback(() => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    nextSchema.push({
      name: '新分类',
      fields: [makeAdminPublishField()],
    });
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  const removePublishCategory = useCallback((index: number) => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    nextSchema.splice(index, 1);
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  const movePublishCategory = useCallback((index: number, direction: -1 | 1) => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= nextSchema.length) return;
    const [item] = nextSchema.splice(index, 1);
    nextSchema.splice(targetIndex, 0, item);
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  const updatePublishCategoryField = useCallback((categoryIndex: number, fieldIndex: number, patch: Partial<PublishCategoryMetaFieldConfig>) => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    const category = nextSchema[categoryIndex];
    if (!category?.fields?.[fieldIndex]) return;
    const current = category.fields[fieldIndex];
    const nextField = { ...current, ...patch };
    if (patch.type) {
      delete nextField.min;
      delete nextField.max;
      delete nextField.maxLength;
      delete nextField.options;
      if (patch.type === 'text') nextField.maxLength = 80;
      if (patch.type === 'select') nextField.options = [];
    }
    category.fields[fieldIndex] = nextField;
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  const addPublishCategoryField = useCallback((categoryIndex: number) => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    const category = nextSchema[categoryIndex];
    if (!category) return;
    category.fields = [...(category.fields || []), makeAdminPublishField()];
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  const removePublishCategoryField = useCallback((categoryIndex: number, fieldIndex: number) => {
    const nextSchema = normalizeAdminPublishCategorySchema(localConfig?.publish_category_schema);
    const category = nextSchema[categoryIndex];
    if (!category) return;
    category.fields = (category.fields || []).filter((_field, index) => index !== fieldIndex);
    setPublishCategorySchema(nextSchema);
  }, [localConfig?.publish_category_schema, setPublishCategorySchema]);

  return {
    publishCategorySchema,
    locationPresets,
    addLocationPreset,
    moveLocationPreset,
    updateLocationPreset,
    removeLocationPreset,
    addPublishCategory,
    movePublishCategory,
    updatePublishCategory,
    removePublishCategory,
    addPublishCategoryField,
    updatePublishCategoryField,
    removePublishCategoryField,
  };
}
