import mongoose from "mongoose";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String
      
    },
    description: {
      type: String
    },
    role: {
      type: String,
      enum: ["educator", "student", "admin"],
      required: true
    },
    class: {
      type: String,
      enum: ["9th", "10th", "11th", "12th", "NEET Dropper", ""],
      default: ""
    },
    subject: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved"
    },
    createdByAdmin: {
      type: Boolean,
      default: false
    },
    photoUrl: {
      type: String,
      default: ""
    },
    enrolledCourses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    }],
    resetOtp:{
      type:String
    },
    otpExpires:{
      type:Date
    },
    isOtpVerifed:{
      type:Boolean,
      default:false
    },
    lastActiveAt: {
      type: Date
    },
    lastLoginAt: {
      type: Date
    },
    totalActiveMinutes: {
      type: Number,
      default: 0
    }
    
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
