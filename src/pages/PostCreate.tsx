import { useLocation } from 'react-router-dom';

import PostCreatePage from '@/features/post-create/PostCreatePage';

type PostCreateState = {
  defaultAnonymous?: boolean;
};

function shouldUseAnonymousIntent(location: ReturnType<typeof useLocation>) {
  const state = location.state as PostCreateState | null;
  if (state?.defaultAnonymous === true) return true;
  const params = new URLSearchParams(location.search);
  return params.get('anonymous') === '1' || params.get('anonymous') === 'true';
}

export default function PostCreateRoute() {
  const location = useLocation();

  return (
    <PostCreatePage
      defaultAnonymous={shouldUseAnonymousIntent(location)}
      anonymousIntentKey={location.key}
    />
  );
}
