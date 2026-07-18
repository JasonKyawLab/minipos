import { Router } from "express";
import { handleError } from "../../utils/handleError.js";
import { env } from "../../config/validation.js";
import { chatLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = Router();

const ASKDESK_URL = env.ASKDESK_URL;
const ASKDESK_KEY = env.ASKDESK_API_KEY;

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

export default router;
