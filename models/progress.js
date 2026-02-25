import mongoose from "mongoose";

const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  watchedLectures: [{ type: String }],
  completion: { type: Number, default: 0 }
});

export default mongoose.model("Progress", progressSchema);
