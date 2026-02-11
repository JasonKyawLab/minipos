export interface JwtPayload {
  userId: string;
  role: "ADMIN" | "USER";
}
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: string;
}