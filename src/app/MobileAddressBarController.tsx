import { useMobileAddressBar } from '@/hooks/useMobileAddressBar';

export default function MobileAddressBarController({ pathname }: { pathname: string }): null {
  useMobileAddressBar(pathname);
  return null;
}
