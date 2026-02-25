import mongoose from "mongoose";

const feePaymentOrderSchema = new mongoose.Schema(
  {
    feeRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeRecord",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "INR",
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      trim: true,
    },
    razorpaySignature: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
      index: true,
    },
    failureReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

feePaymentOrderSchema.index({ feeRecordId: 1, studentId: 1, status: 1 });

const FeePaymentOrder = mongoose.model("FeePaymentOrder", feePaymentOrderSchema);

export default FeePaymentOrder;
