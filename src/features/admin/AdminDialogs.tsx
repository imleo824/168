import { useState, createContext, useContext, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
  validationRegex?: RegExp;
  validationError?: string;
}

interface AdminDialogsContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const AdminDialogsContext = createContext<AdminDialogsContextType | null>(null);

export function useAdminDialogs() {
  const context = useContext(AdminDialogsContext);
  if (!context) {
    throw new Error('useAdminDialogs must be used within an AdminDialogsProvider');
  }
  return context;
}

interface DialogState {
  type: 'confirm' | 'prompt' | null;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  defaultValue: string;
  placeholder: string;
  required: boolean;
  resolve: (value: any) => void;
}

export function AdminDialogsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [errorText, setErrorText] = useState('');

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel || '确认',
        cancelLabel: options.cancelLabel || '取消',
        danger: !!options.danger,
        defaultValue: '',
        placeholder: '',
        required: false,
        resolve,
      });
    });
  };

  const prompt = (options: PromptOptions): Promise<string | null> => {
    setInputValue(options.defaultValue || '');
    setErrorText('');
    return new Promise((resolve) => {
      setDialog({
        type: 'prompt',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel || '确定',
        cancelLabel: options.cancelLabel || '取消',
        danger: false,
        defaultValue: options.defaultValue || '',
        placeholder: options.placeholder || '',
        required: options.required !== false,
        resolve,
      });
    });
  };

  const handleCancel = () => {
    if (!dialog) return;
    dialog.resolve(null);
    setDialog(null);
  };

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.type === 'prompt') {
      const val = inputValue.trim();
      if (dialog.required && !val) {
        setErrorText('该字段不能为空');
        return;
      }
      dialog.resolve(val);
    } else {
      dialog.resolve(true);
    }
    setDialog(null);
  };

  return (
    <AdminDialogsContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden border border-neutral-100 animate-slide-up"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-dialog-title"
          >
            <div className="p-6">
              <h3
                id="admin-dialog-title"
                className="text-lg font-bold text-neutral-900 leading-6"
              >
                {dialog.title}
              </h3>
              <p className="mt-3 text-sm text-neutral-600 whitespace-pre-wrap leading-relaxed">
                {dialog.message}
              </p>

              {dialog.type === 'prompt' && (
                <div className="mt-4">
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      if (errorText) setErrorText('');
                    }}
                    placeholder={dialog.placeholder}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirm();
                      if (e.key === 'Escape') handleCancel();
                    }}
                  />
                  {errorText && (
                    <p className="mt-1.5 text-xs text-red-500 font-medium">
                      {errorText}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex flex-row justify-end items-center gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                onClick={handleCancel}
              >
                {dialog.cancelLabel}
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors cursor-pointer ${
                  dialog.danger
                    ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                    : 'bg-neutral-900 hover:bg-neutral-800 active:bg-black'
                }`}
                onClick={handleConfirm}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminDialogsContext.Provider>
  );
}
