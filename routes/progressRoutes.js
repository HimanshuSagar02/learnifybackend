import express from "express";
import Progress from "../models/progress.js";

const router = express.Router();

// ---- UPDATE PROGRESS ----
router.post("/update", async (req, res) => {
  const { userId, courseId, lectureId, totalLectures } = req.body;

  if(!userId || !courseId || !lectureId){
    return res.status(400).json({message:"Missing fields"});
  }

  let progress = await Progress.findOne({ userId, courseId });

  if (!progress) {
    progress = new Progress({
      userId,
      courseId,
      watchedLectures: [lectureId],
      completion: Math.round((1 / totalLectures) * 100)
    });
  } else {
    if (!progress.watchedLectures.includes(lectureId)) {
      progress.watchedLectures.push(lectureId);
      progress.completion = Math.round((progress.watchedLectures.length / totalLectures) * 100);
    }
  }

  await progress.save();
  res.json({ completion: progress.completion });
});


// ---- GET PROGRESS ----
router.get("/get/:userId/:courseId", async (req, res) => {
  const { userId, courseId } = req.params;
  const data = await Progress.findOne({ userId, courseId });

  res.json(data ? {completion:data.completion} : {completion:0});
});

export default router;
