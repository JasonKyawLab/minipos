export interface JwtPayload {
  userId: string;
  tokenVersion: number;
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