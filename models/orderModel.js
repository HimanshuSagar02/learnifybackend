import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    razorpay_order_id: {
      type: String,
      required: true
    },
    razorpay_payment_id: {
      type: String
    },
    razorpay_signature: {
      type: String
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    paidAt: {
      type: Date
    },
    receiptId: {
      type: String,
      sparse: true
      // Note: unique index is created below, not here to avoid duplicate index warning
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending"
    },
    failureReason: {
      type: String
    }
  },
  { timestamps: true }
);

// Generate unique receipt ID before saving (only for paid orders)
orderSchema.pre("save", async function(next) {
  if (this.isPaid && !this.receiptId) {
    let uniqueId;
    let isUnique = false;
    
    while (!isUnique) {
      // Format: RCR-RCP-YYYYMMDD-XXXXXX
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      uniqueId = `RCR-RCP-${dateStr}-${randomStr}`;
      
      const existing = await mongoose.model("Order").findOne({ receiptId: uniqueId });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.receiptId = uniqueId;
    this.status = "success";
  } else if (!this.isPaid && this.status === "pending") {
    // Keep pending status
  }
  next();
});

// Indexes
// Note: receiptId unique index is created separately to avoid duplicate warning
orderSchema.index({ receiptId: 1 }, { unique: true, sparse: true });
orderSchema.index({ student: 1, course: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ razorpay_order_id: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
