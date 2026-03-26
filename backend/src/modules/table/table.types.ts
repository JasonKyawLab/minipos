export interface RestaurantTable {
  id: string;
  shop_id: string;
  table_number: string;
  capacity: number | null;
  qr_token: string;
  is_active: boolean;
  created_at: Date;
}

export interface CreateTableInput {
  shopId: string;
  tableNumber: string;
  capacity?: number;
}

export interface UpdateTableInput {
  tableNumber?: string;
  capacity?: number;
  isActive?: boolean;
}