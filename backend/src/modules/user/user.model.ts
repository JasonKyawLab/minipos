export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "OWNER" | "STAFF";
  status: "ACTIVE" | "SUSPENDED";
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}