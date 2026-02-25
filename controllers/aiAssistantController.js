import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Course from "../models/courseModel.js";
import Lecture from "../models/lectureModel.js";
import Assignment from "../models/assignmentModel.js";
import Submission from "../models/submissionModel.js";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY not found in environment variables");
}

const getGenAI = () => {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({ apiKey });
};

// 1. AI Intelligent Tutor - ChatGPT-like conversation
export const aiTutorChat = async (req, res) => {
  try {
    const { message, conversationHistory = [], topic, language = "English" } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const genAI = getGenAI();

    const systemPrompt = `You are an intelligent AI tutor for an educational platform. 
Your role is to:
1. Answer student doubts and questions clearly and in a friendly manner
2. Explain topics in ${language} language in a way that's easy to understand
3. Provide examples and analogies when helpful
4. Ask follow-up questions to ensure understanding
5. Provide practice questions when relevant

${topic ? `Current topic context: ${topic}` : ""}

Be conversational, helpful, and educational. Keep responses concise but informative.`;

    const conversationContext = conversationHistory
      .slice(-10) // Keep last 10 messages for context
      .map((msg) => `${msg.role === "user" ? "Student" : "Tutor"}: ${msg.content}`)
      .join("\n");

    const fullPrompt = `${systemPrompt}\n\nConversation History:\n${conversationContext}\n\nStudent: ${message}\nTutor:`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
    });

    const response = result.text.trim();

    return res.status(200).json({
      response,
      conversationHistory: [
        ...conversationHistory,
        { role: "user", content: message },
        { role: "assistant", content: response },
      ],
    });
  } catch (error) {
    console.error("AI Tutor error:", error);
    return res.status(500).json({ message: `AI Tutor failed: ${error.message}` });
  }
};

// 2. Generate practice questions
export const generatePracticeQuestions = async (req, res) => {
  try {
    const { topic, difficulty = "medium", count = 5 } = req.body;

    if (!topic) {
      return res.status(400).json({ message: "Topic is required" });
    }

    const genAI = getGenAI();

    const prompt = `Generate ${count} practice questions about "${topic}" at ${difficulty} difficulty level.
Return ONLY a valid JSON array. Each question object must have:
{
  "question": "string",
  "type": "multiple-choice" or "short-answer",
  "options": ["A", "B", "C", "D"] (only if type is multiple-choice),
  "correctAnswer": "string",
  "explanation": "string"
}
No markdown, no code fences. JSON array only.`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let raw = result.text.trim();
    raw = raw.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) {
      throw new Error("Invalid response format");
    }

    const questions = JSON.parse(raw.slice(start, end + 1));

    return res.status(200).json({ questions });
  } catch (error) {
    console.error("Generate practice questions error:", error);
    return res.status(500).json({ message: `Failed to generate questions: ${error.message}` });
  }
};

// 3. AI Quiz Generator from content
export const generateQuizFromContent = async (req, res) => {
  try {
    const { content, contentType, difficulty = "medium", count = 10 } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const genAI = getGenAI();

    const prompt = `Generate ${count} quiz questions from the following ${contentType || "content"} at ${difficulty} difficulty level.

Content:
${content}

Return ONLY a valid JSON array. Each question object must have:
{
  "question": "string",
  "options": ["A", "B", "C", "D"],
  "correctAnswer": "one of the options",
  "explanation": "string"
}
No markdown, no code fences. JSON array only.`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let raw = result.text.trim();
    raw = raw.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) {
      throw new Error("Invalid response format");
    }

    const quiz = JSON.parse(raw.slice(start, end + 1));

    return res.status(200).json({ quiz });
  } catch (error) {
    console.error("Generate quiz error:", error);
    return res.status(500).json({ message: `Failed to generate quiz: ${error.message}` });
  }
};

// 4. AI Notes Summary
export const generateNotesSummary = async (req, res) => {
  try {
    const { content, contentType, summaryType = "notes" } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const genAI = getGenAI();

    let prompt = "";
    if (summaryType === "notes") {
      prompt = `Summarize the following ${contentType || "content"} into concise, well-organized notes with key points, definitions, and important concepts.

Content:
${content}

Format the notes with:
- Clear headings and subheadings
- Bullet points for key concepts
- Important definitions highlighted
- Examples where relevant`;
    } else if (summaryType === "mindmap") {
      prompt = `Create a mind map structure from the following ${contentType || "content"}. 
Return a JSON object with hierarchical structure:
{
  "centralTopic": "string",
  "mainBranches": [
    {
      "topic": "string",
      "subtopics": ["string", ...]
    }
  ]
}

Content:
${content}`;
    } else if (summaryType === "formula") {
      prompt = `Extract all formulas, equations, and important mathematical/technical expressions from the following ${contentType || "content"}.

Content:
${content}

Return a JSON array:
[
  {
    "formula": "string",
    "description": "string",
    "variables": ["var1", "var2", ...]
  }
]`;
    } else if (summaryType === "short") {
      prompt = `Create a very short summary (maximum 200 words) of the following ${contentType || "content"} highlighting only the most important points.

Content:
${content}`;
    }

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let response = result.text.trim();

    // Try to parse as JSON if it looks like JSON
    if (summaryType === "mindmap" || summaryType === "formula") {
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          response = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // If parsing fails, return as text
      }
    }

    return res.status(200).json({
      summary: response,
      type: summaryType,
    });
  } catch (error) {
    console.error("Generate notes summary error:", error);
    return res.status(500).json({ message: `Failed to generate summary: ${error.message}` });
  }
};

// 5. AI Plagiarism Checker
export const checkPlagiarism = async (req, res) => {
  try {
    const { text, assignmentId } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text is required" });
    }

    const genAI = getGenAI();

    // Get other submissions for comparison if assignmentId provided
    let otherSubmissions = [];
    if (assignmentId) {
      const assignment = await Assignment.findById(assignmentId);
      if (assignment) {
        const submissions = await Submission.find({ assignmentId }).select("submissionUrl comment");
        otherSubmissions = submissions.map((s) => s.comment || "").filter(Boolean);
      }
    }

    const prompt = `Analyze the following text for potential plagiarism. Check for:
1. Similarity with common sources
2. Unusual phrasing that might indicate copying
3. Consistency in writing style
4. Originality score (0-100)

Text to check:
${text}

${otherSubmissions.length > 0 ? `\nCompare with these other submissions:\n${otherSubmissions.join("\n---\n")}` : ""}

Return a JSON object:
{
  "originalityScore": number (0-100),
  "plagiarismRisk": "low" | "medium" | "high",
  "issues": ["string", ...],
  "suggestions": ["string", ...]
}`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    let raw = result.text.trim();
    raw = raw.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("Invalid response format");
    }

    const analysis = JSON.parse(raw.slice(start, end + 1));

    return res.status(200).json(analysis);
  } catch (error) {
    console.error("Plagiarism check error:", error);
    return res.status(500).json({ message: `Plagiarism check failed: ${error.message}` });
  }
};

// 6. Get content from course/lecture for AI features
export const getContentForAI = async (req, res) => {
  try {
    const { courseId, lectureId, type } = req.query;

    if (type === "lecture" && lectureId) {
      const lecture = await Lecture.findById(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }

      return res.status(200).json({
        content: lecture.lectureTitle || "",
        title: lecture.lectureTitle,
        type: "lecture",
      });
    } else if (type === "course" && courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      return res.status(200).json({
        content: course.description || course.subTitle || course.title || "",
        title: course.title,
        type: "course",
      });
    } else {
      return res.status(400).json({ message: "Invalid parameters" });
    }
  } catch (error) {
    console.error("Get content error:", error);
    return res.status(500).json({ message: `Failed to get content: ${error.message}` });
  }
};

