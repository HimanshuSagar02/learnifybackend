import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["event", "announcement", "assignment", "course", "system"],
      default: "announcement",
    },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetAudience: {
      type: String,
      enum: ["all", "students", "educators", "course"],
      default: "all",
    },
    eventDate: { type: Date },
    isRead: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        readAt: { type: Date, default: Date.now },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

notificationSchema.index({ courseId: 1, createdAt: -1 });
notificationSchema.index({ createdBy: 1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;

