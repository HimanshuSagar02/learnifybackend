import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Course from "../models/courseModel.js";
dotenv.config();

const extractModelText = (result) => {
  const directText = typeof result?.text === "string" ? result.text.trim() : "";
  if (directText) {
    return directText;
  }

  const candidateText = (result?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (candidateText) {
    return candidateText;
  }

  const blockReason = result?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`AI response blocked (${blockReason})`);
  }

  throw new Error("AI returned an empty response");
};

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildCourseSearchQuery = (rawTerm) => {
  const term = escapeRegex(String(rawTerm || "").trim());

  return {
    isPublished: true,
    $or: [
      { title: { $regex: term, $options: "i" } },
      { subTitle: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
      { category: { $regex: term, $options: "i" } },
      { subject: { $regex: term, $options: "i" } },
      { class: { $regex: term, $options: "i" } },
      { level: { $regex: term, $options: "i" } },
    ],
  };
};

export const searchWithAi = async (req, res) => {
  try {
    const input = String(req.body?.input || "").trim();

    if (!input) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // 1) Try direct user-query match first
    const directMatches = await Course.find(buildCourseSearchQuery(input));
    if (directMatches.length > 0) {
      return res.status(200).json(directMatches);
    }

    // 2) Fallback to AI-generated keyword if direct search returns nothing
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "AI search unavailable: GEMINI_API_KEY is missing" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an intelligent assistant for a technical learning platform. A user will type any query about what they want to learn. Your task is to understand intent and return one most relevant keyword from this list:

- Programming Fundamentals
- Data Structures
- Web Development
- Mobile Development
- AI/ML
- Data Science
- Cloud & DevOps
- Cybersecurity
- Language Learning
- Beginner
- Intermediate
- Advanced
- Other

Only reply with one single keyword from the list above that best matches the query. Do not explain anything. No extra text.

Query: ${input}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const rawKeyword = extractModelText(response);
    const keyword = rawKeyword
      .split(/\r?\n/)[0]
      .replace(/[^\w\s+-]/g, "")
      .trim();

    if (!keyword) {
      return res.status(200).json([]);
    }

    const aiMatches = await Course.find(buildCourseSearchQuery(keyword));
    return res.status(200).json(aiMatches);
  } catch (error) {
    console.error("AI search error:", error);
    return res.status(500).json({
      message: "AI search failed",
      error: error.message,
    });
  }
};
