import { PRODUCTION_BOM_STATUSES } from "./state-machine";
import type { IngredientCategory, OrderStatus, ShoppingListItem } from "./types";

export interface RawBomRow {
  orderStatus: OrderStatus;
  itemQty: number;
  ingredientName: string;
  category: IngredientCategory;
  qtyPerBox: number;
  unit: string;
  estimatedUnitCostIdr: number;
}

export function aggregateShoppingList(rows: RawBomRow[]): ShoppingListItem[] {
  const map = new Map<string, ShoppingListItem>();

  for (const row of rows) {
    if (!PRODUCTION_BOM_STATUSES.includes(row.orderStatus)) {
      continue;
    }
    const totalNeeded = row.itemQty * row.qtyPerBox;
    const key = `${row.ingredientName.trim().toLowerCase()}::${row.category}::${row.unit.trim().toLowerCase()}`;
    const existing = map.get(key);
    const addedCost = totalNeeded * row.estimatedUnitCostIdr;

    if (existing) {
      existing.totalQty += totalNeeded;
      existing.estimatedCostIdr += addedCost;
    } else {
      map.set(key, {
        ingredientName: row.ingredientName.trim(),
        category: row.category,
        unit: row.unit.trim(),
        totalQty: totalNeeded,
        estimatedCostIdr: addedCost,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.ingredientName.localeCompare(b.ingredientName);
  });
}
