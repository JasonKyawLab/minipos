export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
  token_version: number;
  email_verified: boolean;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}