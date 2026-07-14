import { createContext, useContext, type ReactNode } from 'react';

type OnlinePresenceContextValue = {
  onlineCount: number | null;
  onlineCountText: string;
};

const OnlinePresenceContext = createContext<OnlinePresenceContextValue>({
  onlineCount: null,
  onlineCountText: '',
});

export function OnlinePresenceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: OnlinePresenceContextValue;
}) {
  return (
    <OnlinePresenceContext.Provider value={value}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
