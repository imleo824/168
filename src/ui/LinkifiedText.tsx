interface LinkifiedTextProps {
  text: string;
  className?: string;
  linkClassName?: string;
}

const LEGACY_EMPTY_PROFILE_BIO = '这个人很懒，什么都没有留下。';

export default function LinkifiedText({
  text,
  className = '',
}: LinkifiedTextProps) {
  const normalizedText = String(text || '').trim();
  const value = normalizedText === LEGACY_EMPTY_PROFILE_BIO ? '' : String(text || '');

  return <span className={className}>{value}</span>;
}
