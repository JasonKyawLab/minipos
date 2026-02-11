export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}