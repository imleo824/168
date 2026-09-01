export type PostSheetOpenKind = 'comment' | 'quote';

export type PostSheetOpenDetail = {
  postId: string;
  kind: PostSheetOpenKind;
};

const POST_CARD_SHEET_OPEN_EVENT = 'post-card-sheet-open';

export function dispatchPostSheetOpen(detail: PostSheetOpenDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PostSheetOpenDetail>(POST_CARD_SHEET_OPEN_EVENT, { detail }));
}

export function isPostSheetOpenEvent(event: Event): event is CustomEvent<PostSheetOpenDetail> {
  return event instanceof CustomEvent && typeof event.detail?.postId === 'string';
}

export function subscribePostSheetOpen(listener: (event: CustomEvent<PostSheetOpenDetail>) => void) {
  if (typeof window === 'undefined') return () => {};

  const handleEvent = (event: Event) => {
    if (isPostSheetOpenEvent(event)) listener(event);
  };

  window.addEventListener(POST_CARD_SHEET_OPEN_EVENT, handleEvent);
  return () => window.removeEventListener(POST_CARD_SHEET_OPEN_EVENT, handleEvent);
}
