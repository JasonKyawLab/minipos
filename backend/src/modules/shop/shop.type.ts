export interface Shop {
  id: string;
  owner_id: string;
  name: string;
  shop_type: string;
  currency: string;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}