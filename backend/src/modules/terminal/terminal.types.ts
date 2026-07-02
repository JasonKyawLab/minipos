export type TerminalMode       = 'POS' | 'KITCHEN';
export type TerminalAuthMethod = 'OWNER_PASSWORD' | 'MANAGER_PIN' | 'EMERGENCY_CODE';

export interface TerminalSession {
  id:               string;
  shop_id:          string;
  device_id:        string | null;
  session_token:    string;
  mode:             TerminalMode;
  authorized_by:    string;
  auth_method:      TerminalAuthMethod;
  last_seen_at:     Date;
  expires_at:       Date | null;
  is_revoked:       boolean;
  created_at:       Date;
}

// What gets attached to req after middleware validates the cookie.
// Column aliases in the SQL query (AS "shopId" etc.) must match
// these property names exactly.
export interface TerminalSessionContext {
  id:           string;
  shopId:       string;        // ← aliased from shop_id
  deviceId:     string | null; // ← aliased from device_id
  mode:         TerminalMode;
  authorizedBy: string;        // ← aliased from authorized_by
}

// Extend Express Request — ONE declaration only, here.
// No other file should redeclare terminalSession.
declare global {
  namespace Express {
    interface Request {
      terminalSession?: TerminalSessionContext;
    }
  }
}