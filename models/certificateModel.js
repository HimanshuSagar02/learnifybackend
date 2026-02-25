import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  certificateId: { 
    type: String, 
    unique: true, 
    required: true
    // Note: unique automatically creates an index, and we also create one below
    // To avoid duplicate warning, we'll remove the explicit index() call below
  },
  issuedOn: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  verificationCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Generate unique certificate ID before saving
certificateSchema.pre("save", async function(next) {
  if (!this.certificateId) {
    let uniqueId;
    let isUnique = false;
    
    while (!isUnique) {
      // Format: RCR-YYYYMMDD-XXXXXX (6 random alphanumeric)
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      uniqueId = `RCR-${dateStr}-${randomStr}`;
      
      // Check if ID already exists
      const existing = await mongoose.model("Certificate").findOne({ certificateId: uniqueId });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.certificateId = uniqueId;
  }
  next();
});

// Indexes for efficient queries
// Note: certificateId index is automatically created by unique: true above
certificateSchema.index({ userId: 1, courseId: 1 });
certificateSchema.index({ isActive: 1 });

export default mongoose.model("Certificate", certificateSchema);
