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

function nextSchemaVersion(category: PublishCategoryMetaConfig) {
  return Math.max(1, Math.floor(Number(category.schemaVersion) || 1)) + 1;
}

function makeUniquePublishField(fields: PublishCategoryMetaFieldConfig[] = []) {
  const usedKeys = new Set(fields.map((field) => String(field?.key || '').trim()).filter(Boolean));
  let index = fields.length + 1;
  let key = `field_${index}`;
  while (usedKeys.has(key)) {
    index += 1;
    key = `field_${index}`;
  }
  return makeAdminPublishField('text', {
    key,
    label: `字段 ${index}`,
  });
}

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

  const updatePublishCategorySchema = useCallback((updater: (schema: PublishCategoryMetaConfig[]) => PublishCategoryMetaConfig[]) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      publish_category_schema: updater(normalizeAdminPublishCategorySchema(prev?.publish_category_schema)),
    }));
  }, [setLocalConfig]);

  const updatePublishCategory = useCallback((index: number, patch: Partial<PublishCategoryMetaConfig>) => {
    updatePublishCategorySchema((nextSchema) => {
      if (!nextSchema[index]) return nextSchema;
      nextSchema[index] = { ...nextSchema[index], ...patch };
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

  const addPublishCategory = useCallback(() => {
    updatePublishCategorySchema((nextSchema) => {
      nextSchema.push({
        name: '新分类',
        schemaVersion: 1,
        fields: [makeUniquePublishField()],
      });
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

  const removePublishCategory = useCallback((index: number) => {
    updatePublishCategorySchema((nextSchema) => {
      nextSchema.splice(index, 1);
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

  const movePublishCategory = useCallback((index: number, direction: -1 | 1) => {
    updatePublishCategorySchema((nextSchema) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= nextSchema.length) return nextSchema;
      const [item] = nextSchema.splice(index, 1);
      nextSchema.splice(targetIndex, 0, item);
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

  const updatePublishCategoryField = useCallback((categoryIndex: number, fieldIndex: number, patch: Partial<PublishCategoryMetaFieldConfig>) => {
    updatePublishCategorySchema((nextSchema) => {
      const category = nextSchema[categoryIndex];
      if (!category?.fields?.[fieldIndex]) return nextSchema;
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
      category.schemaVersion = nextSchemaVersion(category);
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

  const addPublishCategoryField = useCallback((categoryIndex: number) => {
    updatePublishCategorySchema((nextSchema) => {
      const category = nextSchema[categoryIndex];
      if (!category) return nextSchema;
      category.fields = [...(category.fields || []), makeUniquePublishField(category.fields || [])];
      category.schemaVersion = nextSchemaVersion(category);
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

  const removePublishCategoryField = useCallback((categoryIndex: number, fieldIndex: number) => {
    updatePublishCategorySchema((nextSchema) => {
      const category = nextSchema[categoryIndex];
      if (!category) return nextSchema;
      category.fields = (category.fields || []).filter((_field, index) => index !== fieldIndex);
      category.schemaVersion = nextSchemaVersion(category);
      return nextSchema;
    });
  }, [updatePublishCategorySchema]);

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
