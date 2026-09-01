import { memo, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

type UITextTone = 'primary' | 'strong' | 'secondary' | 'muted' | 'subtle';
type UITextVariant = 'caption' | 'meta' | 'body' | 'title';

interface UITextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: UITextVariant;
  tone?: UITextTone;
  className?: string;
  children?: ReactNode;
}

const variantClassMap: Record<UITextVariant, string> = {
  caption: 'ui-type-caption',
  meta: 'ui-type-meta',
  body: 'ui-type-body',
  title: 'ui-type-title',
};

const toneClassMap: Record<UITextTone, string> = {
  primary: 'ui-text-primary',
  strong: 'ui-text-strong',
  secondary: 'ui-text-secondary',
  muted: 'ui-text-muted',
  subtle: 'ui-text-subtle',
};

function UIText({
  as: Component = 'span',
  variant = 'body',
  tone = 'primary',
  className = '',
  children,
  ...props
}: UITextProps) {
  return (
    <Component
      className={`${variantClassMap[variant]} ${toneClassMap[tone]} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export default memo(UIText);
