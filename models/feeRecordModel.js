import mongoose from "mongoose";

const PAYMENT_MODES = ["cash", "upi", "card", "bank-transfer", "online", "other"];

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    paymentMode: {
      type: String,
      enum: PAYMENT_MODES,
      default: "cash",
    },
    referenceId: {
      type: String,
      default: "",
      trim: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    razorpayOrderId: {
      type: String,
      default: "",
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: false }
);

const feeRecordSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    title: {
      type: String,
      default: "Coaching Fee",
      trim: true,
      maxlength: 200,
    },
    planType: {
      type: String,
      enum: ["one-time", "monthly"],
      default: "one-time",
    },
    installmentNumber: {
      type: Number,
      min: 1,
      default: 1,
    },
    totalInstallments: {
      type: Number,
      min: 1,
      default: 1,
    },
    totalFee: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalFee: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "overdue"],
      default: "pending",
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    centerName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1500,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    installments: {
      type: [paymentEntrySchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

feeRecordSchema.index({ studentId: 1, dueDate: 1 });
feeRecordSchema.index({ studentId: 1, status: 1 });

const FeeRecord = mongoose.model("FeeRecord", feeRecordSchema);

export default FeeRecord;
