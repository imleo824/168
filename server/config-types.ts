export type PublishCategoryMetaFieldType = 'text' | 'number' | 'boolean' | 'select' | 'location';

export interface PublishCategoryMetaFieldConfig {
  key: string;
  label: string;
  type: PublishCategoryMetaFieldType;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface PublishCategoryMetaConfig {
  categorySlug?: string;
  schemaVersion?: number;
  id?: string;
  slug?: string;
  name?: string;
  fields: PublishCategoryMetaFieldConfig[];
}

export interface ParsedPublishCategorySchema {
  schema: PublishCategoryMetaConfig[];
  parseError?: string;
}

export interface LocationPresetConfig {
  country: string;
  cities: string[];
}
