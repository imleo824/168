import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { APP_ROUTES } from '@/app/routePaths';
import { usePost } from '@/hooks/useDataPosts';
import LegacyPostDetail from '@/pages/PostDetailLegacy';

const TUI_PLUS_AUTO_POST_SOURCE_PREFIX = 'TUI_PLUS_AUTO_POST';

function isTuiPlusActivationPost(post: any) {
  return String(post?.source || '').startsWith(TUI_PLUS_AUTO_POST_SOURCE_PREFIX);
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: post } = usePost(id);

  useEffect(() => {
    if (!isTuiPlusActivationPost(post)) return;
    navigate(APP_ROUTES.tuiPlus, {
      replace: true,
      state: { from: id ? `/post/${id}` : undefined, requiredBenefit: 'activationPost' },
    });
  }, [id, navigate, post]);

  return <LegacyPostDetail />;
}
