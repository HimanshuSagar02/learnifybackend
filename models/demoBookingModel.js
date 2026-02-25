import mongoose from "mongoose";

const demoBookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    className: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1200,
    },
    preferredDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "contacted", "scheduled", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const DemoBooking = mongoose.model("DemoBooking", demoBookingSchema);

export default DemoBooking;
