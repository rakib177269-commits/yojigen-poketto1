// Product + colour options for the item pickers (manual orders, order edits).
export async function productOptions(supabase) {
  const { data, error } = await supabase.from('products')
    .select('id, title, price, stock, variants:product_variants(id, name, stock, is_active, sort_order)')
    .eq('status', 'active').order('title');
  if (error) throw new Error(error.message);
  return data.flatMap((p) => {
    const variants = p.variants.filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order);
    if (!variants.length) {
      return [{ key: `${p.id}:`, product_id: p.id, variant_id: null, label: p.title, price: p.price, stock: p.stock }];
    }
    return variants.map((v) => ({
      key: `${p.id}:${v.id}`, product_id: p.id, variant_id: v.id, label: `${p.title} — ${v.name}`, price: p.price, stock: v.stock,
    }));
  });
}
