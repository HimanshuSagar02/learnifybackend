import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    lectureId: { type: mongoose.Schema.Types.ObjectId, ref: "Lecture" },
    educatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    records: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["present", "absent", "late"], default: "present" },
      },
    ],
  },
  { timestamps: true }
);

attendanceSchema.index({ courseId: 1, date: 1 });

const Attendance = mongoose.model("Attendance", attendanceSchema);
export default Attendance;

