import type { CartLine, ChosenModifier, PublicMenuItem, PublicMenuItemVariant } from "@/types/pos";

export type CartAction =
  | { type: "ADD";        line: CartLine }
  | { type: "UPDATE_QTY"; key: string; delta: number }
  | { type: "CLEAR" };

export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "ADD": {
      const existing = state.find((l) => l.key === action.line.key);
      if (existing) {
        return state.map((l) =>
          l.key === action.line.key
            ? { ...l, qty: l.qty + 1, lineTotal: l.lineTotal + action.line.lineTotal }
            : l
        );
      }
      return [...state, action.line];
    }

    case "UPDATE_QTY":
      return state
        .map((l) => {
          if (l.key !== action.key) return l;
          const newQty = l.qty + action.delta;
          if (newQty <= 0) return null;
          const unitPrice = l.lineTotal / l.qty;
          return { ...l, qty: newQty, lineTotal: unitPrice * newQty };
        })
        .filter(Boolean) as CartLine[];

    case "CLEAR":
      return [];
  }
}

export function makeKey(
  variantId: string,
  modifiers: ChosenModifier[],
  note: string
): string {
  const modKey = modifiers.map((m) => m.modifier_option_id).sort().join(",");
  return `${variantId}|${modKey}|${note}`;
}

export function buildCartLine(
  product:   PublicMenuItem,
  variant:   PublicMenuItemVariant,
  modifiers: ChosenModifier[],
  note:      string
): CartLine {
  const key       = makeKey(variant.id, modifiers, note);
  const unitPrice = variant.price + modifiers.reduce((s, m) => s + m.price_delta, 0);
  return {
    key,
    variantId:   variant.id,
    productName: product.product_name,
    variantName: variant.name,
    basePrice:   variant.price,
    modifiers,
    note,
    qty:         1,
    lineTotal:   unitPrice,
  };
}
