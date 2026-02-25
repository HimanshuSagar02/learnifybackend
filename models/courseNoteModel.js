import mongoose from "mongoose";

const courseNoteSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    content: { type: String },
    fileUrl: { type: String },
  },
  { timestamps: true }
);

const CourseNote = mongoose.model("CourseNote", courseNoteSchema);
export default CourseNote;

