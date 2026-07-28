import { useMobileAddressBar } from '@/hooks/useMobileAddressBar';

export default function MobileAddressBarController({ pathname }: { pathname: string }) {
  useMobileAddressBar(pathname);
  return null;
}
