const express = require("express");
const cors = require("cors");
const authRouter = require("./routes/auth");
const targetiseRouter = require("./routes/targetise");
const webhooksRouter = require("./routes/webhooks");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", authRouter);
app.use("/api", targetiseRouter);
app.use("/api", webhooksRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Targetise Shopify app listening on port ${PORT}`);
});
