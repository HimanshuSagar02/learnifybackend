import Course from "../models/courseModel.js";
import razorpay from 'razorpay'
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import dotenv from "dotenv"
dotenv.config()
const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
})

export const createOrder = async (req, res) => {
  try {
    const { courseId, userId } = req.body;
    if (!courseId || !userId) {
      return res.status(400).json({ message: "courseId and userId are required" });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const coursePrice = Number(course.price);
    if (!Number.isFinite(coursePrice) || coursePrice <= 0) {
      return res.status(400).json({
        message: "This course is free. Please enroll directly without payment.",
        code: "FREE_COURSE"
      });
    }

    const options = {
      amount: Math.round(coursePrice * 100), // in paisa
      currency: 'INR',
      receipt: `${courseId}-${Date.now()}`,
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    
    // Create order record in database
    const order = await Order.create({
      course: courseId,
      student: userId,
      razorpay_order_id: razorpayOrder.id,
      amount: coursePrice,
      status: "pending"
    });

    console.log(`[Order] Created order: ${order._id} for user: ${userId}, course: ${courseId}`);

    return res.status(200).json({
      ...razorpayOrder,
      orderId: order._id
    });
  } catch (err) {
    console.error("[Order] Create order error:", err);
    return res.status(500).json({ message: `Order creation failed: ${err.message}` });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId, userId } = req.body;
    
    console.log(`[Order] Verifying payment for order: ${razorpay_order_id}`);
    
    // Find order in database
    let order = await Order.findOne({ razorpay_order_id }).populate("course").populate("student");
    
    if (!order) {
      console.error(`[Order] Order not found: ${razorpay_order_id}`);
      return res.status(404).json({ message: "Order not found" });
    }

    // Fetch order info from Razorpay
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);
    
    if (orderInfo.status === 'paid') {
      // Update order with payment details
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_signature = razorpay_signature;
      order.isPaid = true;
      order.paidAt = new Date();
      order.status = "success";
      await order.save();

      // Update user and course enrollment
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Prevent educators and admins from enrolling via payment
      if (user.role === "educator" || user.role === "admin") {
        order.status = "failed";
        order.failureReason = "Educators and admins cannot enroll in courses";
        await order.save();
        return res.status(403).json({ 
          message: "Educators and admins cannot enroll in courses." 
        });
      }

      const course = await Course.findById(courseId).populate("lectures");
      if (!course) return res.status(404).json({ message: "Course not found" });

      // Prevent enrolling in own course
      if (course.creator.toString() === userId.toString()) {
        order.status = "failed";
        order.failureReason = "Cannot enroll in own course";
        await order.save();
        return res.status(403).json({ 
          message: "You cannot enroll in your own course." 
        });
      }

      // Check if already enrolled
      const isAlreadyEnrolled = course.enrolledStudents && Array.isArray(course.enrolledStudents) && course.enrolledStudents.some(
        (id) => id.toString() === userId.toString()
      );

      if (isAlreadyEnrolled) {
        return res.status(200).json({ 
          message: "Payment verified. You are already enrolled in this course",
          alreadyEnrolled: true,
          orderId: order._id,
          receiptId: order.receiptId
        });
      }

      // Add enrollment
      user.enrolledCourses.push(courseId);
      await user.save();

      if (!course.enrolledStudents) {
        course.enrolledStudents = [];
      }
      course.enrolledStudents.push(userId);
      await course.save();

      console.log(`[Order] Payment verified successfully. Order: ${order._id}, Receipt: ${order.receiptId}`);

      return res.status(200).json({ 
        message: "Payment verified and enrollment successful",
        alreadyEnrolled: false,
        orderId: order._id,
        receiptId: order.receiptId
      });
    } else {
      // Mark order as failed
      order.status = "failed";
      order.failureReason = "Payment verification failed";
      await order.save();
      
      return res.status(400).json({ message: "Payment verification failed (invalid signature)" });
    }
  } catch (error) {
    console.error("[Order] Verify payment error:", error);
    return res.status(500).json({ message: "Internal server error during payment verification" });
  }
};
