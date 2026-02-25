import mongoose from "mongoose";

const gradeSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    educatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    assignmentName: {
      type: String,
      default: "",
    },
    examType: {
      type: String,
      enum: ["assignment", "quiz", "midterm", "final", "project", "other"],
      default: "assignment",
    },
    marksObtained: {
      type: Number,
      required: true,
    },
    totalMarks: {
      type: Number,
      required: true,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    grade: {
      type: String,
      enum: ["A+", "A", "B+", "B", "C+", "C", "D", "F"],
      default: "F",
    },
    remarks: {
      type: String,
      default: "",
    },
    date: {
      type: Date,
      default: Date.now,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Calculate percentage and grade before saving
gradeSchema.pre("save", function (next) {
  if (this.totalMarks > 0) {
    this.percentage = Math.round((this.marksObtained / this.totalMarks) * 100);
    
    // Assign grade based on percentage
    if (this.percentage >= 90) this.grade = "A+";
    else if (this.percentage >= 80) this.grade = "A";
    else if (this.percentage >= 70) this.grade = "B+";
    else if (this.percentage >= 60) this.grade = "B";
    else if (this.percentage >= 50) this.grade = "C+";
    else if (this.percentage >= 40) this.grade = "C";
    else if (this.percentage >= 30) this.grade = "D";
    else this.grade = "F";
  }
  next();
});

// Indexes for efficient queries
gradeSchema.index({ studentId: 1, courseId: 1 });
gradeSchema.index({ courseId: 1 });
gradeSchema.index({ educatorId: 1 });

const Grade = mongoose.model("Grade", gradeSchema);
export default Grade;

