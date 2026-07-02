// Per-shop key so one browser serving two shops gets two independent device identities.
export function getOrCreateDeviceKey(shopId: string): string {
  if (typeof window === "undefined") return "";

  const storageKey = `minipos_device_key_${shopId}`;
  let key = localStorage.getItem(storageKey);

  if (!key) {
    key = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, key);
  }

  return key;
}