export type DeviceMode = 'POS' | 'KITCHEN';
export type LogoutReason = 'SELF' | 'FORCE' | 'MODE_EXIT';

export interface StaffModeSession {
  id:            string;
  shop_id:       string;
  device_id:     string;
  user_id:       string;
  mode_type:     DeviceMode;
  login_at:      Date;
  logout_at:     Date | null;
  logout_reason: LogoutReason | null;
  created_at:    Date;
}