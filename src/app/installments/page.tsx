import { redirect } from 'next/navigation';

export default function InstallmentsRedirectPage() {
  redirect('/accounts/receipts');
}
