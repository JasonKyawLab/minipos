// src/types/express.d.ts
// Ensure all session types are consistent

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: "ADMIN" | "USER";
      };
      posSession?: {
        userId: string;
        shopId: string;
        shopRole: "OWNER" | "MANAGER" | "CASHIER";
      };
      kitchenSession?: {
        userId: string;
        shopId: string;
        shopRole: "OWNER" | "MANAGER" | "CHEF";
      };
      qr?: {
        shopId: string;
        tableId: string;
        tableNumber: string;
      };
    }
  }
}

export {};