export interface SafeUser {
  id: string;
  email: string;
  createdAt?: Date | string;
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
