import { SITE } from '../../../lib/site.js';

export const metadata = { title: 'Returns', description: 'Our returns policy.', alternates: { canonical: '/returns' } };

export default function ReturnsPage() {
  return (
    <div className="container prose">
      <h1>Returns</h1>
      <p><strong>All sales are final. We do not accept returns or exchanges.</strong></p>
      <h2>Check your parcel on delivery</h2>
      <p>
        Because you pay on delivery, please check your parcel in front of the delivery rider
        before paying. If the parcel is damaged or is not what you ordered, contact us right away
        on <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a> (call or WhatsApp) before you pay.
      </p>
      <p>
        Before ordering, feel free to message us with any question about size, colour or how a
        product works.
      </p>
    </div>
  );
}
