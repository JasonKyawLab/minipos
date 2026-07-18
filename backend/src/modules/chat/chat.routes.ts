import { Router } from "express";
import { handleError } from "../../utils/handleError.js";
import { env } from "../../config/validation.js";
import { chatLimiter } from "../../middlewares/rateLimit.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";

const router = Router();

const ASKDESK_URL  = env.ASKDESK_URL;
const ASKDESK_KEY  = env.ASKDESK_API_KEY;
const ASKDESK_ADMIN = env.ASKDESK_ADMIN_KEY;

router.post("/ask", chatLimiter, async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    const response = await fetch(`${ASKDESK_URL}/api/v1/ask`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key":    ASKDESK_KEY!,
      },
      body: JSON.stringify({ message: message.trim(), session_id: session_id ?? "anon" }),
    });

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/faqs", async (_req, res) => {
  try {
    const response = await fetch(`${ASKDESK_URL}/api/v1/faqs`, {
      headers: { "X-API-Key": ASKDESK_KEY! },
    });
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/replies", chatLimiter, async (req, res) => {
  try {
    const { session_id, since } = req.query;
    const url = new URL(`${ASKDESK_URL}/api/v1/replies`);
    if (session_id) url.searchParams.set("session_id", session_id as string);
    if (since)      url.searchParams.set("since", since as string);

    const response = await fetch(url.toString(), {
      headers: { "X-API-Key": ASKDESK_KEY! },
    });

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

// ── Admin routes (ADMIN only, backend-to-backend with admin key) ──
router.get("/admin/pending", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  try {
    const r = await fetch(`${ASKDESK_URL}/api/v1/admin/pending`, {
      headers: { "X-Admin-Key": ASKDESK_ADMIN! },
    });
    return res.json(await r.json());
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/admin/stats", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  try {
    const r = await fetch(`${ASKDESK_URL}/api/v1/admin/stats`, {
      headers: { "X-Admin-Key": ASKDESK_ADMIN! },
    });
    return res.json(await r.json());
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/admin/reply", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { id, message } = req.body;
    if (!id || !message?.trim()) return res.status(400).json({ message: "id and message are required." });
    const r = await fetch(`${ASKDESK_URL}/api/v1/admin/reply`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": ASKDESK_ADMIN! },
      body:    JSON.stringify({ id, message: message.trim() }),
    });
    return res.json(await r.json());
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/admin/dismiss", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "id is required." });
    const r = await fetch(`${ASKDESK_URL}/api/v1/admin/dismiss`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": ASKDESK_ADMIN! },
      body:    JSON.stringify({ id }),
    });
    return res.json(await r.json());
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
