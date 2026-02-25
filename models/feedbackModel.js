import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    feedbackType: {
      type: String,
      enum: ["teacher", "facilities"],
      required: true
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function() {
        return this.feedbackType === "teacher";
      }
    },
    teacherName: {
      type: String,
      required: function() {
        return this.feedbackType === "teacher";
      }
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: ["teaching_quality", "communication", "punctuality", "support", "overall", "infrastructure", "technology", "resources", "environment"],
      default: "overall"
    },
    isAnonymous: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved"],
      default: "pending"
    },
    adminResponse: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);
export default Feedback;

