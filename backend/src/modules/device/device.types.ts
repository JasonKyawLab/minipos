// =========================================================
// device.types.ts
// Path: src/modules/device/device.types.ts
// =========================================================
// Types for the device registration and management module.
//
// DeviceStatus lifecycle:
//   PENDING  → device registered itself, awaiting owner approval
//   APPROVED → owner approved, device can activate modes
//   REVOKED  → owner revoked, device cannot use the system
// =========================================================

export type DeviceStatus = 'PENDING' | 'APPROVED' | 'REVOKED';

export interface ShopDevice {
  id:               string;
  shop_id:          string;
  device_name:      string | null;
  device_key:       string;
  status:           DeviceStatus;
  current_mode:     string | null;
  mode_activated_by: string | null;
  mode_activated_at: Date | null;
  approved_by:      string | null;
  user_agent:       string | null;
  ip_address:       string | null;
  last_seen_at:     Date | null;
  created_at:       Date;
}

export interface RegisterDeviceInput {
  shopId:     string;
  deviceKey:  string;
  deviceName: string | null;
  userAgent:  string | null;
  ipAddress:  string | null;
}