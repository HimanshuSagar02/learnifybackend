import mongoose from "mongoose";

const liveClassSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    // null courseId means a general session visible to all students.
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    educatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deliveryMode: {
      type: String,
      enum: ["online", "hybrid", "offline"],
      default: "online",
    },
    platformType: {
      type: String,
      enum: ["portal", "other", "zoom", "google-meet", "offline"],
      default: "portal",
    },
    meetingLink: { type: String, default: "" }, // Required for zoom/google-meet, optional for portal
    meetingId: { type: String }, // Optional - for Zoom/Google Meet
    meetingPassword: { type: String }, // Optional - for Zoom/Google Meet
    offlineDetails: {
      centerName: { type: String, default: "" },
      classroom: { type: String, default: "" },
      address: { type: String, default: "" },
      landmark: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    liveKitRoomName: { type: String }, // LiveKit room name for portal platform
    scheduledDate: { type: Date, required: true },
    duration: { type: Number, default: 60 }, // Duration in minutes
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
    },
    maxParticipants: { type: Number, default: 100 },
    enrolledStudents: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        joinedAt: { type: Date },
        leftAt: { type: Date },
        attendance: { type: Boolean, default: false },
      },
    ],
    recordingUrl: { type: String }, // For storing recording after class
    notes: { type: String }, // Class notes or summary
  },
  { timestamps: true }
);

liveClassSchema.index({ courseId: 1, scheduledDate: 1 });
liveClassSchema.index({ educatorId: 1 });
liveClassSchema.index({ status: 1 });

const LiveClass = mongoose.model("LiveClass", liveClassSchema);
export default LiveClass;

