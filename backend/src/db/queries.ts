import { pool } from "./pool.js";

export const db = {
  query: (text: string, params?: any[]) => {
    return pool.query(text, params);
  },
};