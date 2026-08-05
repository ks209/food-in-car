import prisma from '../config/prisma.js';

// Revalidates a customer's cart against the LIVE menu right before checkout —
// never trusts client-sent price, availability, or customization data. A
// persisted/stale cart (or a hand-crafted request) could otherwise submit an
// order for an item that's since gone unavailable, been repriced, or had its
// option groups changed.
//
// Returns { ok: true, items, totalAmount } with server-authoritative pricing,
// or { ok: false, error } with a message safe to show the customer directly.
export async function validateAndPriceCart(restaurantId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Your cart is empty' };
  }

  const menuItemIds = [...new Set(items.map((i) => i.id).filter(Boolean))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, restaurantId: parseInt(restaurantId) },
    include: { optionGroups: { include: { options: true } } },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));

  const priced = [];
  for (const cartItem of items) {
    const menuItem = byId.get(cartItem.id);
    if (!menuItem) {
      return { ok: false, error: `"${cartItem.name || 'An item'}" is no longer on the menu — remove it from your cart` };
    }
    if (!menuItem.isActive || !menuItem.available) {
      return { ok: false, error: `"${menuItem.name}" is currently unavailable — remove it from your cart` };
    }

    const quantity = Math.max(1, parseInt(cartItem.quantity) || 1);

    // Re-derive selected customizations from the item's LIVE option groups —
    // an option id the client sent that doesn't match a real, current option
    // is simply dropped rather than trusted (it can't be priced safely).
    const selectedIds = new Set((cartItem.selectedOptions || []).map((o) => o.id));
    const selectedOptions = [];
    for (const group of menuItem.optionGroups) {
      const picked = group.options.filter((o) => selectedIds.has(o.id));
      if (group.required && picked.length === 0) {
        return { ok: false, error: `"${menuItem.name}" needs a selection for "${group.title}"` };
      }
      if (!group.multiple && picked.length > 1) {
        return { ok: false, error: `"${menuItem.name}" only allows one choice for "${group.title}"` };
      }
      selectedOptions.push(...picked);
    }

    const unitPrice = menuItem.price + selectedOptions.reduce((s, o) => s + o.priceDelta, 0);
    priced.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      unitPrice,
      finalPrice: unitPrice,
      quantity,
      options: selectedOptions.map((o) => ({ name: o.name, priceDelta: o.priceDelta })),
    });
  }

  const totalAmount = priced.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return { ok: true, items: priced, totalAmount };
}
