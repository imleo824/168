import React, { type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import ActionButton from '@/ui/ActionButton';
import { StateBlock } from '@/ui/LoadingState';

const CHUNK_RELOAD_MARKER_KEY = 'ui.chunk-reload-marker';
const CHUNK_RELOAD_TTL_MS = 15_000;

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  resetKeys?: unknown[];
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isRecoverableChunkError(error: unknown) {
  const text = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error || '');

  return /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module/i.test(text);
}

function shouldReloadForChunkError() {
  if (typeof window === 'undefined') return false;

  try {
    const storage = window.sessionStorage;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const raw = storage.getItem(CHUNK_RELOAD_MARKER_KEY);
    if (!raw) return true;

    const [storedPath = '', storedAt = '0'] = raw.split('|');
    const timestamp = Number(storedAt);
    const isFresh = Number.isFinite(timestamp) && Date.now() - timestamp <= CHUNK_RELOAD_TTL_MS;
    return !(storedPath === currentPath && isFresh);
  } catch {
    return true;
  }
}

function markChunkReload() {
  if (typeof window === 'undefined') return;

  try {
    const storage = window.sessionStorage;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    storage.setItem(CHUNK_RELOAD_MARKER_KEY, `${currentPath}|${Date.now()}`);
  } catch {
    // Ignore storage failures and still attempt reload.
  }
}

function areResetKeysEqual(prev?: unknown[], next?: unknown[]) {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  return prev.every((value, index) => Object.is(value, next[index]));
}

type ErrorBoundaryRuntime = {
  readonly props: Readonly<Props>;
  setState: (state: State) => void;
};

function getRuntime(boundary: ErrorBoundary): ErrorBoundaryRuntime {
  return boundary as unknown as ErrorBoundaryRuntime;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.hasError) return;
    if (areResetKeysEqual(prevProps.resetKeys, getRuntime(this).props.resetKeys)) return;
    this.reset();
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    getRuntime(this).props.onError?.(error, errorInfo);
    console.error('Error caught by boundary:', error, errorInfo);

    if (isRecoverableChunkError(error) && shouldReloadForChunkError()) {
      markChunkReload();
      window.location.reload();
    }
  }

  reset = () => {
    getRuntime(this).setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = getRuntime(this).props;
      if (fallback !== undefined) return fallback;
      return (
        <div className="ui-error-boundary">
          <StateBlock
            title="出错了"
            description="页面遇到了意外错误，可以重试或刷新页面。"
            tone="error"
            icon={<AlertCircle className="ui-error-boundary-icon-svg" />}
            action={
              <ActionButton type="button" onClick={this.reset} variant="muted">
                重试
              </ActionButton>
            }
            secondaryAction={
              <ActionButton type="button" onClick={() => window.location.reload()} variant="brand">
                <RefreshCcw />
                刷新页面
              </ActionButton>
            }
          />
        </div>
      );
    }
    return getRuntime(this).props.children;
  }
}
