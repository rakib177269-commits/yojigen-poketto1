import CheckoutForm from '../../../components/CheckoutForm.js';
import { getCustomer } from '../../../lib/server/customer-session.js';
import { supabaseService } from '../../../lib/server/supabase.js';
import { formatBdPhone } from '../../../lib/phone.js';

export const metadata = { title: 'Checkout', robots: { index: false, follow: false } };

// Signed-in customers get their details from their last order filled in.
async function savedDetails() {
  const me = await getCustomer();
  if (!me) return null;
  const { data } = await supabaseService().rpc('customer_account', { p_customer_id: me.customerId });
  if (!data) return null;
  return {
    name: data.name ?? data.last_address?.name ?? '',
    phone: formatBdPhone(data.phone),
    address: data.last_address?.address ?? '',
    email: data.email ?? data.last_address?.email ?? '',
  };
}

export default async function CheckoutPage() {
  return <div className="container"><CheckoutForm initial={await savedDetails()} /></div>;
}
