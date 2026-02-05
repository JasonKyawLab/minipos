import app from "./app.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

app.get("/test", (req, res) => {
      res.json({ status: "OK", message: "MiniPOS is running" });
    });