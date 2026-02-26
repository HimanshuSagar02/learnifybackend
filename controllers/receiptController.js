import PDFDocument from "pdfkit";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";
import isAuth from "../middlewares/isAuth.js";

/* =====================================================
    GENERATE RECEIPT PDF (Authenticated)
=====================================================*/
export const generateReceipt = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;

    console.log(`[Receipt] Generating receipt for order: ${orderId}, user: ${userId}`);

    // Find order
    const order = await Order.findById(orderId)
      .populate("student", "name email")
      .populate("course", "title description price creator")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user has permission (student who made order, or admin/educator)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isOwner = order.student._id.toString() === userId.toString();
    const isAdmin = user.role === "admin";
    const isEducator = user.role === "educator";

    if (!isOwner && !isAdmin && !isEducator) {
      return res.status(403).json({ 
        message: "You don't have permission to access this receipt" 
      });
    }

    // Only generate receipt for paid orders
    if (!order.isPaid || !order.receiptId) {
      return res.status(400).json({ 
        message: "Receipt can only be generated for successful payments" 
      });
    }

    const student = order.student;
    const course = order.course;

    /* ---------- PDF CONFIG ---------- */
    const doc = new PDFDocument({
      layout: "portrait",
      size: "A4",
      margin: 50,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Receipt-${order.receiptId}.pdf`);
    doc.pipe(res);

    /* ---------- HEADER ---------- */
    doc.fontSize(24)
       .font("Helvetica-Bold")
       .fillColor("#000")
       .text("Learnify", 50, 50, { align: "center" });

    doc.fontSize(18)
       .font("Helvetica-Bold")
       .text("PAYMENT RECEIPT", 50, 90, { align: "center" });

    /* ---------- BORDER ---------- */
    doc.rect(50, 120, 500, 600).lineWidth(2).stroke("#000");

    /* ---------- RECEIPT DETAILS ---------- */
    let yPos = 140;

    // Receipt ID
    doc.fontSize(12)
       .font("Helvetica-Bold")
       .text("Receipt ID:", 70, yPos);
    doc.font("Helvetica")
       .text(order.receiptId, 200, yPos);
    yPos += 30;

    // Date
    doc.font("Helvetica-Bold")
       .text("Date:", 70, yPos);
    doc.font("Helvetica")
       .text(new Date(order.paidAt || order.createdAt).toLocaleDateString('en-US', {
         year: 'numeric',
         month: 'long',
         day: 'numeric'
       }), 200, yPos);
    yPos += 30;

    // Payment ID
    if (order.razorpay_payment_id) {
      doc.font("Helvetica-Bold")
         .text("Payment ID:", 70, yPos);
      doc.font("Helvetica")
         .text(order.razorpay_payment_id, 200, yPos);
      yPos += 30;
    }

    // Order ID
    doc.font("Helvetica-Bold")
       .text("Order ID:", 70, yPos);
    doc.font("Helvetica")
       .text(order.razorpay_order_id, 200, yPos);
    yPos += 40;

    /* ---------- STUDENT DETAILS ---------- */
    doc.fontSize(14)
       .font("Helvetica-Bold")
       .text("Student Details:", 70, yPos);
    yPos += 25;

    doc.fontSize(12)
       .font("Helvetica-Bold")
       .text("Name:", 70, yPos);
    doc.font("Helvetica")
       .text(student.name, 200, yPos);
    yPos += 25;

    doc.font("Helvetica-Bold")
       .text("Email:", 70, yPos);
    doc.font("Helvetica")
       .text(student.email, 200, yPos);
    yPos += 40;

    /* ---------- COURSE DETAILS ---------- */
    doc.fontSize(14)
       .font("Helvetica-Bold")
       .text("Course Details:", 70, yPos);
    yPos += 25;

    doc.fontSize(12)
       .font("Helvetica-Bold")
       .text("Course Title:", 70, yPos);
    doc.font("Helvetica")
       .text(course.title, 200, yPos, { width: 300 });
    yPos += 30;

    if (course.description) {
      doc.font("Helvetica-Bold")
         .text("Description:", 70, yPos);
      doc.font("Helvetica")
         .fontSize(10)
         .text(course.description.substring(0, 100) + (course.description.length > 100 ? "..." : ""), 200, yPos, { width: 300 });
      yPos += 30;
    }

    yPos += 20;

    /* ---------- PAYMENT DETAILS ---------- */
    doc.fontSize(14)
       .font("Helvetica-Bold")
       .text("Payment Details:", 70, yPos);
    yPos += 25;

    doc.fontSize(12)
       .font("Helvetica-Bold")
       .text("Amount:", 70, yPos);
    doc.font("Helvetica")
       .fontSize(16)
       .text(`₹${order.amount.toFixed(2)}`, 200, yPos);
    yPos += 25;

    doc.fontSize(12)
       .font("Helvetica-Bold")
       .text("Currency:", 70, yPos);
    doc.font("Helvetica")
       .text(order.currency || "INR", 200, yPos);
    yPos += 25;

    doc.font("Helvetica-Bold")
       .text("Status:", 70, yPos);
    doc.font("Helvetica")
       .fillColor("#00AA00")
       .text(order.status === "success" ? "PAID" : order.status.toUpperCase(), 200, yPos);
    doc.fillColor("#000");
    yPos += 40;

    /* ---------- TOTAL ---------- */
    doc.moveTo(70, yPos)
       .lineTo(530, yPos)
       .lineWidth(2)
       .stroke();
    yPos += 20;

    doc.fontSize(16)
       .font("Helvetica-Bold")
       .text("Total Amount:", 70, yPos);
    doc.text(`₹${order.amount.toFixed(2)}`, 400, yPos, { align: "right" });
    yPos += 40;

    /* ---------- FOOTER ---------- */
    doc.fontSize(10)
       .font("Helvetica")
       .fillColor("#666")
       .text("This is a computer-generated receipt. No signature required.", 50, 680, { align: "center" });
    
    doc.text("Learnify", 50, 700, { align: "center" });
    doc.text("Thank you for your enrollment!", 50, 715, { align: "center" });

    doc.end();

    console.log(`[Receipt] PDF generated successfully for order: ${orderId}`);

  } catch (err) {
    console.error("[Receipt] Generate error:", err);
    res.status(500).json({ 
      message: "Failed to generate receipt", 
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error" 
    });
  }
};

/* =====================================================
    GET USER'S RECEIPTS (Authenticated)
=====================================================*/
export const getMyReceipts = async (req, res) => {
  try {
    const userId = req.userId;

    console.log(`[Receipt] Fetching receipts for user: ${userId}`);

    const orders = await Order.find({ 
      student: userId,
      isPaid: true
    })
      .populate("course", "title description thumbnail")
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      receipts: orders.map(order => ({
        orderId: order._id,
        receiptId: order.receiptId,
        courseTitle: order.course?.title,
        courseDescription: order.course?.description,
        courseThumbnail: order.course?.thumbnail,
        amount: order.amount,
        currency: order.currency,
        paidAt: order.paidAt,
        status: order.status,
        paymentId: order.razorpay_payment_id
      }))
    });

  } catch (err) {
    console.error("[Receipt] Get receipts error:", err);
    return res.status(500).json({ 
      message: "Failed to fetch receipts", 
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error" 
    });
  }
};



