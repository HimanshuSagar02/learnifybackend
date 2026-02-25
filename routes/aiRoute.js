import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
dotenv.config();

const router = express.Router();

// ================= AI QUIZ ROUTE ================= //
router.post("/generate-quiz", async (req, res) => {
  try {
    const topic = (req.body?.topic || "").trim();
    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenAI({ apiKey });
    // Use gemini-2.5-flash which works with @google/genai package

    const prompt = `
You are creating a quiz for learners.
Return exactly 5 multiple-choice questions about: "${topic}".
Respond ONLY with a valid JSON array of 5 objects. Each object must be:
 {
  "question": "string",
  "options": ["A","B","C","D"], // exactly 4 strings
  "answer": "one of the options"
 }
No markdown, no code fences, no commentary. JSON only.
`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let raw = result.text.trim();
    raw = raw.replace(/```json|```/g, "").trim();

    // Extract the JSON array if the model added any stray text
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model did not return a JSON array");
    }

    const jsonSlice = raw.slice(start, end + 1);

    let quiz;
    try {
      quiz = JSON.parse(jsonSlice);
    } catch (parseErr) {
      console.error("\n❗ RAW MODEL OUTPUT (parse failed):\n", raw);
      throw new Error(`Invalid JSON from model: ${parseErr.message}`);
    }

    // Basic validation: ensure array of 5 with required keys
    const isValid =
      Array.isArray(quiz) &&
      quiz.length === 5 &&
      quiz.every(
        (q) =>
          q &&
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.answer === "string"
      );

    if (!isValid) {
      console.error("\n❗ RAW MODEL OUTPUT (invalid structure):\n", raw);
      throw new Error("Model returned an invalid quiz structure");
    }

    return res.json({ quiz });
  } catch (err) {
  console.log("\n🚨 FULL AI ERROR LOG:\n", err, "\n");
    return res
      .status(500)
      .json({ error: "AI Quiz Failed", details: err.message });
}
});

export default router;
