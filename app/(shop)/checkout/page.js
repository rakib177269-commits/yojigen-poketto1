import CheckoutForm from '../../../components/CheckoutForm.js';

export const metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return <div className="container"><CheckoutForm /></div>;
}
