export type OrderStatus =
  | "MENUNGGU_DP"
  | "TERJADWAL"
  | "DIPRODUKSI"
  | "SIAP_KIRIM"
  | "SELESAI_DIKIRIM"
  | "DIBATALKAN";

export type PackageCategory = "NASI_KOTAK" | "SNACK_BOX" | "TUMPENG_PRASMANAN";
export type IngredientCategory = "BAHAN_BAKU" | "KEMASAN";
export type PaymentMethod = "TUNAI" | "QRIS" | "TRANSFER";
export type PaymentKind = "DP" | "PELUNASAN";

export interface PublicSettings {
  businessName: string;
  whatsappNumber: string;
  addressArea: string;
  dailyCapacityBoxes: number;
  minDpPercent: number;
}

export interface PackageIngredient {
  id: number;
  packageId: number;
  ingredientName: string;
  category: IngredientCategory;
  qtyPerBox: number;
  unit: string;
  estimatedUnitCostIdr: number;
}

export interface MenuPackage {
  id: number;
  code: string;
  name: string;
  category: PackageCategory;
  description: string;
  unitLabel: string;
  priceIdr: number;
  minOrderQty: number;
  isActive: boolean;
  ingredients: PackageIngredient[];
}

export interface OrderItem {
  id: number;
  orderId: number;
  packageId: number;
  packageNameSnapshot: string;
  qty: number;
  unitPriceIdr: number;
  subtotalIdr: number;
}

export interface OrderPayment {
  id: number;
  orderId: number;
  amountIdr: number;
  method: PaymentMethod;
  kind: PaymentKind;
  paidAt: string;
  note: string;
}

export interface CateringOrder {
  id: number;
  orderCode: string;
  customerName: string;
  institutionName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryTime: string;
  notes: string;
  status: OrderStatus;
  totalBoxes: number;
  totalIdr: number;
  paidIdr: number;
  remainingIdr: number;
  minDpIdr: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments: OrderPayment[];
}

export interface PublicOrderTrack {
  orderCode: string;
  customerName: string;
  institutionName: string;
  deliveryDate: string;
  deliveryTime: string;
  notes: string;
  status: OrderStatus;
  totalBoxes: number;
  totalIdr: number;
  paidIdr: number;
  remainingIdr: number;
  minDpIdr: number;
  items: Array<{
    packageNameSnapshot: string;
    qty: number;
    unitPriceIdr: number;
    subtotalIdr: number;
  }>;
  payments: Array<{
    amountIdr: number;
    method: PaymentMethod;
    kind: PaymentKind;
    paidAt: string;
  }>;
}

export interface DailyCapacityInfo {
  date: string;
  usedBoxes: number;
  capacityBoxes: number;
  remainingBoxes: number;
  utilizationPct: number;
}

export interface ShoppingListItem {
  ingredientName: string;
  category: IngredientCategory;
  unit: string;
  totalQty: number;
  estimatedCostIdr: number;
}

export interface CashRecap {
  totalCollectedIdr: number;
  totalReceivableIdr: number;
  activeOrderCount: number;
  byMethod: Record<PaymentMethod, number>;
}

export interface CreateOrderInput {
  customerName: string;
  institutionName?: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryTime: string;
  notes?: string;
  items: Array<{ packageId: number; qty: number }>;
  initialPayment?: {
    amountIdr: number;
    method: PaymentMethod;
    note?: string;
  };
}

export interface RecordPaymentInput {
  amountIdr: number;
  method: PaymentMethod;
  kind: PaymentKind;
  note?: string;
}

export interface CreateMenuPackageInput {
  code: string;
  name: string;
  category: PackageCategory;
  description: string;
  unitLabel: string;
  priceIdr: number;
  minOrderQty: number;
  ingredients: Array<{
    ingredientName: string;
    category: IngredientCategory;
    qtyPerBox: number;
    unit: string;
    estimatedUnitCostIdr: number;
  }>;
}

export interface UpdateSettingsInput {
  dailyCapacityBoxes?: number;
  minDpPercent?: number;
  businessName?: string;
  whatsappNumber?: string;
  addressArea?: string;
  newPin?: string;
}
