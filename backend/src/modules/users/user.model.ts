export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "OWNER" | "STAFF";
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  created_at: Date;
}