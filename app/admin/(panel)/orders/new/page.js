import { requireStaff } from '../../../../../lib/server/auth.js';
import { productOptions } from '../../../../../lib/admin/products.js';
import { createManualOrder } from '../../../../../lib/admin/actions.js';
import ActionForm from '../../../../../components/admin/ActionForm.js';
import ItemsEditor from '../../../../../components/admin/ItemsEditor.js';

export const metadata = { title: 'New manual order' };

export default async function NewOrderPage() {
  const staff = await requireStaff(['admin', 'manager', 'support']);
  const options = await productOptions(staff.supabase);
  return (
    <>
      <h1 className="admin-h1">New manual order</h1>
      <p className="hint">For phone and Facebook orders. Prices, stock and the delivery zone use the same rules as the website.</p>
      <div className="panel" style={{ maxWidth: 760 }}>
        <ActionForm action={createManualOrder} submitLabel="Create order">
          <div className="form-2">
            <div className="field"><label htmlFor="m-name">Customer name</label><input id="m-name" name="name" className="input" required /></div>
            <div className="field"><label htmlFor="m-phone">Mobile number</label><input id="m-phone" name="phone" className="input" inputMode="tel" required placeholder="01XXX-XXXXXX" /></div>
          </div>
          <div className="field"><label htmlFor="m-address">Full address</label><textarea id="m-address" name="address" className="textarea" required /></div>
          <div className="form-2">
            <div className="field"><label htmlFor="m-note">Note</label><input id="m-note" name="note" className="input" /></div>
            <div className="field"><label htmlFor="m-fee">Delivery fee override (৳)</label>
              <input id="m-fee" name="delivery_fee" className="input" inputMode="numeric" placeholder="Leave empty for the zone fee" /></div>
          </div>
          <fieldset className="fieldset"><legend>Items</legend><ItemsEditor options={options} /></fieldset>
        </ActionForm>
      </div>
    </>
  );
}
