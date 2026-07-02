// JWT payload stored inside pos_token cookie.
// type:"POS" distinguishes it from the platform access_token
// so the two can never be confused or substituted.
export interface PosJwtPayload {
  userId:    string;
  shopId:    string;
  shopRole:  "OWNER" | "MANAGER" | "CASHIER";
  type:      "POS";
  tokenVersion: number;
}

// What the staff-list endpoint returns — safe to send to
// an unauthenticated POS tablet screen (no hashes, no PII
// beyond what the tablet already shows).
export interface StaffListItem {
  user_id:   string;
  name:      string;
  role:      "OWNER" | "MANAGER" | "CASHIER";
  has_pin:   boolean;          // true = PIN is set, cashier can tap their name
  is_locked: boolean;          // true = currently locked out
}