
const ERROR_MESSAGES: Record<string, string> = {
  // ── Auth ──────────────────────────────────────────────────
  INVALID_CREDENTIALS:       "Invalid email or password.",
  USER_EXISTS:               "An account with this email already exists.",
  USER_NOT_FOUND:            "User not found.",
  TOKEN_EXPIRED:             "Your session has expired. Please log in again.",
  INVALID_TOKEN:             "Invalid session. Please log in again.",
  TOKEN_REVOKED:             "Your session was revoked. Please log in again.",
  INVALID_CURRENT_PASSWORD:  "Current password is incorrect.",
  PASSWORD_MUST_BE_DIFFERENT:"New password must be different from current password.",
  SHOP_SUSPENDED:            "This shop has been suspended. Please contact support.",
  ACCOUNT_SUSPENDED:         "Your account has been suspended. Please contact support.",
  // ── Permissions ───────────────────────────────────────────
  FORBIDDEN:                       "You do not have permission to do this.",
  NOT_AUTHORIZED:                  "You are not authorized for this action.",
  PERMISSION_DENIED:               "Permission denied.",
  ONLY_OWNER_CAN_UPDATE_SHOP:      "Only the shop owner can update shop settings.",
  ONLY_OWNER_CAN_DELETE_SHOP:      "Only the shop owner can delete this shop.",
  CANNOT_MODIFY_SELF_ROLE:         "You cannot change your own role.",
  CANNOT_DELETE_SELF:              "You cannot delete your own account.",
  CANNOT_MODIFY_OWNER_ROLE:        "The owner's role cannot be changed.",
  CANNOT_DEMOTE_LAST_ADMIN:        "Cannot demote the last admin account.",
  CANNOT_MODIFY_SELF_ROLE_2:       "You cannot modify your own role.",


  // ── Shop ──────────────────────────────────────────────────
  SHOP_NOT_FOUND:         "Shop not found.",
  USER_ALREADY_ACTIVE:    "This staff member is already active.",
  STAFF_NOT_FOUND:        "Staff member not found.",

  // ── Orders ────────────────────────────────────────────────
  ORDER_NOT_FOUND:             "Order not found.",
  ORDER_NOT_EDITABLE:          "This order has already been paid or cancelled.",
  ORDER_ALREADY_PAID:          "This order has already been paid.",
  ORDER_HAS_NO_ITEMS:          "Add at least one item before paying.",
  ORDER_NOT_PAID:              "This order has not been paid yet.",
  ORDER_FULLY_REFUNDED:        "This order has already been fully refunded.",
  INVALID_STATUS_TRANSITION:   "This status change is not allowed.",
  ORDER_ITEM_NOT_FOUND:        "Order item not found.",
  ORDER_ITEM_ALREADY_REFUNDED: "This item has already been refunded.",
  INVALID_ORDER_ID:            "Invalid order reference.",

  // ── Products ──────────────────────────────────────────────
  MODEL_NOT_FOUND:          "Product not found.",
  ITEM_NOT_FOUND:           "Product item not found.",
  PRODUCT_ITEM_NOT_FOUND:   "Product item not found.",
  PRODUCT_ITEM_INACTIVE:    "This product item is currently unavailable.",
  PRODUCT_ITEM_SOLD_OUT:    "This item is currently sold out.",
  SKU_ALREADY_EXISTS:       "A product with this SKU already exists.",
  BARCODE_ALREADY_EXISTS:   "A product with this barcode already exists.",
  DUPLICATE_ENTRY:          "A duplicate entry already exists.",
  PRODUCT_MODEL_NOT_FOUND:  "Product model not found.",

  // ── Payment ───────────────────────────────────────────────
  AMOUNT_MISMATCH: "Payment amount does not match the order total.",

  // ── Refund ────────────────────────────────────────────────
  REFUND_EXCEEDS_REMAINING:      "Refund amount exceeds the remaining refundable total.",
  REFUND_QTY_EXCEEDS_ORIGINAL:   "Refund quantity exceeds the original quantity.",
  REFUND_ITEMS_REQUIRED:         "Please select items to refund.",
  PAYMENT_NOT_FOUND:             "Payment record not found.",
  REFUND_QTY_MUST_BE_POSITIVE:   "Refund quantity must be greater than zero.",
  INVALID_REFUND_TYPE:           "Invalid refund type.",

  // ── Inventory ─────────────────────────────────────────────
  INSUFFICIENT_STOCK: "Not enough stock for this item.",

  // ── Tables ────────────────────────────────────────────────
  TABLE_NOT_FOUND:              "Table not found.",
  TABLE_NUMBER_ALREADY_EXISTS:  "This table number is already in use.",
  INVALID_QR_TOKEN:             "Invalid or expired QR code.",

  // ── PIN / POS auth ────────────────────────────────────────
  PIN_NOT_SET:            "PIN not set. Ask a manager to set your PIN.",
  PIN_INVALID_FORMAT:     "PIN must be 4–6 digits.",
  SHOP_MEMBER_NOT_FOUND:  "Staff member not found in this shop.",
  STAFF_NOT_POS_ELIGIBLE: "This staff member cannot use the POS terminal.",
  PIN_LOCKED:             "Too many incorrect attempts. Account locked for 15 minutes.",

  // ── Kitchen auth ──────────────────────────────────────────
  KITCHEN_NOT_AUTHENTICATED:  "Kitchen session expired. Please sign in again.",
  INVALID_KITCHEN_TOKEN:      "Kitchen session is invalid. Please sign in again.",
  KITCHEN_NOT_IN_KITCHEN_MODE:"This device is not in Kitchen mode.",

  // ── Device verification ───────────────────────────────────
  // Returned by requireVerifiedDevice middleware (before PIN is checked).
  // Shown on the PIN entry screen and staff selection screen.
  //
  // DEVICE_NOT_VERIFIED covers two backend causes:
  //   a) terminal_id cookie is missing — device was never activated.
  //   b) terminal_id is in DB but IP/UA geofence failed (strict mode).
  // We intentionally use the same user message for both: we do not
  // want to tell an attacker whether the token exists or not.
  DEVICE_NOT_VERIFIED:
    "This device is not activated. Ask the owner to approve and activate it from the dashboard.",

  // The device record exists but its status is PENDING or REVOKED.
  DEVICE_NOT_APPROVED:
    "This device has not been approved yet. Ask the owner to approve it in Dashboard → Permissions.",

  // The DB query for device verification itself failed (e.g. DB down).
  // "fail closed" — deny but tell the user to retry.
  DEVICE_VERIFICATION_UNAVAILABLE:
    "Device check temporarily unavailable. Please try again in a moment.",

  // ── Terminal session errors ───────────────────────────────
  // Returned by the terminal/exit endpoint when there is no
  // terminal_session cookie to verify against.
  NO_ACTIVE_MODE_SESSION:
    "No active mode session found. Please activate this device from the dashboard first.",

  // The terminal_session cookie exists but the DB row is missing,
  // revoked, or belongs to a different shop.
  TERMINAL_SESSION_INVALID:
    "Terminal session has expired or was revoked. Please re-activate this device.",

  // Shop ID in the terminal_session doesn't match the URL param.
  TERMINAL_SHOP_MISMATCH:
    "Session does not belong to this shop. Please re-activate the device.",

  // ── Devices (dashboard management) ───────────────────────
  DEVICE_NOT_FOUND:                      "Device not found.",
  DEVICE_ALREADY_IN_MODE:                "This device is already in a mode.",
  DEVICE_NOT_IN_MODE:                    "This device is not currently in a mode.",
  DEVICE_NOT_PENDING:                    "This device is not awaiting approval.",
  DEVICE_MUST_BE_REVOKED_BEFORE_DELETE:  "Revoke the device before deleting it.",
  DEVICE_ALREADY_REVOKED:                "This device is already revoked.",
  DEVICE_SHOP_MISMATCH:                  "Device does not belong to this shop.",

  // ── Modifiers ─────────────────────────────────────────────
  GROUP_NOT_FOUND:   "Modifier group not found.",
  OPTION_NOT_FOUND:  "Modifier option not found.",
  MIN_EXCEEDS_MAX:   "Minimum selection cannot exceed maximum selection.",
  LINK_NOT_FOUND:    "Modifier link not found.",
  STATION_NOT_FOUND: "Kitchen station not found.",

  // ── Reports ───────────────────────────────────────────────
  INVALID_DATE_FORMAT:     "Invalid date format. Use YYYY-MM-DD.",
  FROM_DATE_AFTER_TO_DATE: "Start date cannot be after end date.",
  DATE_RANGE_TOO_LARGE:    "Date range cannot exceed one year.",

  // ── Mode gate (ModeGate.tsx) ──────────────────────────────
  INVALID_PASSWORD:          "Incorrect password. Please try again.",
  MODE_GATE_PASSWORD_FAILED: "Incorrect password. Please try again.",

  // ── Generic ───────────────────────────────────────────────
  NOTHING_TO_UPDATE: "Please make at least one change before saving.",
  FETCH_FAILED:      "Failed to load data. Please check your connection.",
  LOGIN_FAILED:      "Login failed. Please try again.",
};

/**
 * Converts a backend error code to a user-facing message.
 * Falls back to a generic message for unknown codes.
 *
 * Usage:
 *   toast.error(getErrorMessage(err.response?.data?.message));
 */
export function getErrorMessage(code?: string): string {
  if (!code) return "Something went wrong. Please try again.";
  return ERROR_MESSAGES[code] ?? `Something went wrong. Please try again.`;
}

export default ERROR_MESSAGES;