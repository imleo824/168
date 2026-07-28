import {
  clearPostCreateComposerFocusIntent,
  focusPostCreateTextareaElement,
  schedulePostCreateBridgeRelease,
} from './postCreateFocusCore';

export function focusPostCreateComposer(textarea: HTMLTextAreaElement) {
  focusPostCreateTextareaElement(textarea);
  const focused = document.activeElement === textarea;
  if (focused) {
    clearPostCreateComposerFocusIntent();
    schedulePostCreateBridgeRelease();
  }
  return focused;
}
