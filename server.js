const express = require("express");
const rateLimit = require("express-rate-limit");

const app = express();

app.use(express.json({ limit: "10kb" }));

app.get("/", (_req, res) => {
  res.json({ status: "JARVIS server is running" });
});

app.use(
  "/ask",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.post("/ask", async (req, res) => {
  const accessToken = process.env.JARVIS_ACCESS_TOKEN;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!accessToken || !apiKey) {
    return res.status(503).json({
      error: "Server secrets are not configured"
    });
  }

  if (req.get("x-jarvis-token") !== accessToken) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const question =
    typeof req.body?.question === "string"
      ? req.body.question.trim()
      : "";

  if (!question || question.length > 2000) {
    return res.status(400).json({
      error: "Question must contain 1 to 2000 characters"
    });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.8-flash",
          store: false,
          input:
            "You are JARVIS, a helpful personal assistant. " +
            "Reply naturally in Hindi when the user speaks Hindi. " +
            "Do not claim to have performed phone actions. " +
            "User's question: " + question
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini request failed:", response.status);
      return res.status(502).json({
        error: "Gemini request failed"
      });
    }

    const answer = (data.steps || [])
      .filter(step => step.type === "model_output")
      .flatMap(step => step.content || [])
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!answer) {
      return res.status(502).json({
        error: "Gemini returned no text answer"
      });
    }

    return res.json({ answer });
  } catch (_error) {
    return res.status(502).json({
      error: "Could not contact Gemini"
    });
  }
});

const port = process.env.PORT || 10000;

app.listen(port, "0.0.0.0", () => {
  console.log(`JARVIS server listening on ${port}`);
});
