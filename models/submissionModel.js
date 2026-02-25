import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submissionUrl: { type: String },
    attachmentUrl: { type: String },
    comment: { type: String },
    status: { type: String, enum: ["submitted", "graded"], default: "submitted" },
    score: { type: Number },
    feedback: { type: String },
  },
  { timestamps: true }
);

const Submission = mongoose.model("Submission", submissionSchema);
export default Submission;

