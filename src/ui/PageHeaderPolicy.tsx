import { createContext, useContext, type ReactNode } from 'react';
import type { PageHeaderTopbarMode, PageHeaderVariant } from '@/ui/PageHeader';

interface PageHeaderPolicyValue {
  forceShowBack?: boolean;
  variant?: PageHeaderVariant;
  topbarMode?: PageHeaderTopbarMode;
  onBack?: () => void;
  right?: ReactNode;
}

const PageHeaderPolicyContext = createContext<PageHeaderPolicyValue | null>(null);

export function PageHeaderPolicyProvider({
  value,
  children,
}: {
  value: PageHeaderPolicyValue;
  children: ReactNode;
}) {
  return (
    <PageHeaderPolicyContext.Provider value={value}>
      {children}
    </PageHeaderPolicyContext.Provider>
  );
}

export function usePageHeaderPolicy() {
  return useContext(PageHeaderPolicyContext);
}
