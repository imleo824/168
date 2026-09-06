export const UI_USER_DESKTOP_MIN_WIDTH = 1024;
export const UI_USER_MOBILE_MAX_WIDTH = UI_USER_DESKTOP_MIN_WIDTH - 1;
export const UI_USER_DESKTOP_AUX_RAIL_MIN_WIDTH = 1180;

export const UI_USER_MOBILE_MEDIA_QUERY = `(max-width: ${UI_USER_MOBILE_MAX_WIDTH}px)`;
export const UI_IMAGE_MOBILE_MEDIA_QUERY = '(max-width: 48rem)';

export const UI_APP_SHELL_BOUNDED_IMAGE_WIDTH = '1180px';
export const UI_PROFILE_COVER_IMAGE_WIDTH = '72rem';

export const UI_DEFAULT_IMAGE_SIZES = {
  thumb: `${UI_IMAGE_MOBILE_MEDIA_QUERY} 96px, 180px`,
  medium: `${UI_IMAGE_MOBILE_MEDIA_QUERY} 100vw, 420px`,
  large: `${UI_IMAGE_MOBILE_MEDIA_QUERY} 100vw, 860px`,
} as const;

export const UI_HOME_AD_IMAGE_SIZES =
  `${UI_USER_MOBILE_MEDIA_QUERY} 100vw, ${UI_APP_SHELL_BOUNDED_IMAGE_WIDTH}`;

export const UI_PROFILE_HEADER_COVER_SIZES =
  `${UI_IMAGE_MOBILE_MEDIA_QUERY} 100vw, ${UI_PROFILE_COVER_IMAGE_WIDTH}`;

export function getMaxWidthMediaQuery(maxWidthPx: number) {
  return `(max-width: ${Math.max(0, Math.floor(maxWidthPx))}px)`;
}

export function getMinWidthMediaQuery(minWidthPx: number) {
  return `(min-width: ${Math.max(0, Math.floor(minWidthPx))}px)`;
}
