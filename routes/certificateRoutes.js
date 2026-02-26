import express from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import Certificate from "../models/certificateModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";
import isAuth from "../middlewares/isAuth.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// Get frontend URL from environment variable
// In production, FRONTEND_URL should be set (e.g., https://yourdomain.com)
// In development, it can fallback to localhost
const getFrontendUrl = () => {
  // Priority: FRONTEND_URL > construct from request > localhost fallback
  if (process.env.FRONTEND_URL) {
    // Remove trailing slash if present
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }
  
  // Try to construct from request origin (for deployment behind proxy)
  // This will be handled in the route handler if needed
  
  // Development fallback
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5173';
  }
  
  // Production fallback - should not reach here if FRONTEND_URL is set
  console.warn('[Certificate] FRONTEND_URL not set! Using fallback. Please set FRONTEND_URL environment variable.');
  return 'http://localhost:5173';
};

/* =====================================================
    GENERATE CERTIFICATE PDF (Authenticated)
=====================================================*/
router.get("/generate/:courseId", isAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.userId;

    console.log(`[Certificate] Generating certificate for user: ${userId}, course: ${courseId}`);

    const user = await User.findById(userId);
    const course = await Course.findById(courseId).populate("creator", "name");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if user is enrolled in the course
    const isEnrolled = course.enrolledStudents?.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isEnrolled && user.role !== "admin") {
      return res.status(403).json({ 
        message: "You must be enrolled in the course to generate a certificate" 
      });
    }

    // Check if certificate already exists
    let certificate = await Certificate.findOne({ 
      userId, 
      courseId,
      isActive: true 
    });

    if (!certificate) {
      // Create new certificate (certificateId will be auto-generated)
      certificate = await Certificate.create({ userId, courseId });
      console.log(`[Certificate] Created new certificate with ID: ${certificate.certificateId}`);
    } else {
      console.log(`[Certificate] Using existing certificate with ID: ${certificate.certificateId}`);
    }

    // Generate verification URL
    let frontendUrl = getFrontendUrl();
    
    // If FRONTEND_URL is not set, try to construct from request
    if (!process.env.FRONTEND_URL && req.headers.origin) {
      // Use request origin as fallback (works in deployment behind proxy)
      frontendUrl = req.headers.origin.replace(/\/$/, '');
      console.log(`[Certificate] Using request origin as frontend URL: ${frontendUrl}`);
    } else if (!process.env.FRONTEND_URL && req.headers.referer) {
      // Try to extract from referer
      try {
        const url = new URL(req.headers.referer);
        frontendUrl = `${url.protocol}//${url.host}`;
        console.log(`[Certificate] Using referer as frontend URL: ${frontendUrl}`);
      } catch (e) {
        console.warn('[Certificate] Could not parse referer, using default');
      }
    }
    
    const verifyUrl = `${frontendUrl}/certificate/verify/${certificate.certificateId}`;
    console.log(`[Certificate] Verification URL: ${verifyUrl}`);
    
    // Generate QR Code with verification URL
    const qrData = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      width: 300
    });

    /* ---------- PDF CONFIG ---------- */
    const doc = new PDFDocument({
      layout: "landscape",
      size: "A4",
      margin: 20,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${user.name.replace(/\s+/g, '-')}-${course.title.replace(/\s+/g, '-')}-certificate.pdf`);
    doc.pipe(res);

    /* ---------- BORDER ---------- */
    doc.rect(15, 15, doc.page.width - 30, doc.page.height - 30).lineWidth(3).stroke("#000");
    doc.rect(35, 35, doc.page.width - 70, doc.page.height - 70).lineWidth(1).stroke("#000");

    /* ---------- WATERMARK ---------- */
    doc.save();
    doc.font("Helvetica-Bold")
       .fontSize(140)
       .fillColor("#3B82F6")
       .opacity(0.15)
       .text("Learnify", doc.page.width / 2 - 250, doc.page.height / 2 - 110);
    doc.restore();

    /* ---------- TITLE ---------- */
    doc.font("Helvetica-Bold")
       .fillColor("#000")
       .fontSize(42)
       .text("CERTIFICATE OF COMPLETION", 0, 80, { align: "center" });

    /* ---------- MAIN BODY ---------- */
    doc.fontSize(18).fillColor("#000").text("This certifies that", 0, 165, { align: "center" });

    doc.font("Helvetica-Bold")
       .fontSize(34)
       .fillColor("#000")
       .text(user.name.toUpperCase(), 0, 210, { align: "center" });

    doc.font("Helvetica")
       .fontSize(18)
       .fillColor("#000")
       .text("has successfully completed the course", 0, 260, { align: "center" });

    doc.font("Helvetica-Bold")
       .fontSize(28)
       .fillColor("#000")
       .text(course.title, 0, 300, { align: "center" });

    /* ---------- DATE & CERTIFICATE ID ---------- */
    doc.fontSize(14).fillColor("#000")
       .text(`Certificate ID: ${certificate.certificateId}`, 0, 350, { align: "center" });

    doc.fontSize(14)
       .text(`Issued On: ${new Date(certificate.issuedOn).toLocaleDateString('en-US', { 
         year: 'numeric', 
         month: 'long', 
         day: 'numeric' 
       })}`, 0, 375, { align: "center" });

    /* ---------- QR CODE ---------- */
    const qrSize = 120;
    const qrX = 70;
    const qrY = doc.page.height - qrSize - 70;
    
    // Convert base64 QR code to buffer
    const qrBuffer = Buffer.from(qrData.split(',')[1], 'base64');
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.fontSize(12).fillColor("#000").text("Scan to Verify", qrX + 22, doc.page.height - 50);

    /* ---------- SIGNATURE LINE ---------- */
    const signY = doc.page.height - 150;
    doc.moveTo(doc.page.width / 2 - 120, signY)
       .lineTo(doc.page.width / 2 + 120, signY)
       .stroke();

    doc.fontSize(14).fillColor("#000").text("Authorized Signature", 0, signY + 10, { align: "center" });
    
    if (course.creator) {
      doc.fontSize(12).fillColor("#666").text(course.creator.name || "Course Creator", 0, signY + 30, { align: "center" });
    }

    /* ---------- FOOTER ---------- */
    doc.fontSize(10).fillColor("#666")
       .text("Learnify", 0, doc.page.height - 35, { align: "center" });
    doc.fontSize(8).fillColor("#999")
       .text(`Verify at: ${verifyUrl}`, 0, doc.page.height - 25, { align: "center" });

    doc.end();

    console.log(`[Certificate] PDF generated successfully for certificate: ${certificate.certificateId}`);

  } catch (err) {
    console.error("[Certificate] Generate error:", err);
    res.status(500).json({ 
      message: "Failed to generate certificate", 
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error" 
    });
  }
});

/* =====================================================
    VERIFY CERTIFICATE BY ID (Public endpoint)
=====================================================*/
router.get("/verify/:certificateId", async (req, res) => {
  try {
    const { certificateId } = req.params;

    console.log(`[Certificate] Verifying certificate ID: ${certificateId}`);

    if (!certificateId) {
      return res.status(400).json({ 
        valid: false,
        message: "Certificate ID is required" 
      });
    }

    // Find certificate by certificateId
    const certificate = await Certificate.findOne({ 
      certificateId: certificateId.toUpperCase(),
      isActive: true 
    })
      .populate("userId", "name email photoUrl")
      .populate("courseId", "title description thumbnail creator")
      .lean();

    if (!certificate) {
      console.log(`[Certificate] Certificate not found: ${certificateId}`);
      return res.status(404).json({ 
        valid: false,
        message: "Certificate not found or invalid" 
      });
    }

    // Update verification count and timestamp
    await Certificate.findByIdAndUpdate(certificate._id, {
      $inc: { verificationCount: 1 },
      verified: true,
      verifiedAt: new Date()
    });

    console.log(`[Certificate] Certificate verified successfully: ${certificateId}`);

    return res.status(200).json({
      valid: true,
      message: "Certificate is valid",
      certificate: {
        certificateId: certificate.certificateId,
        studentName: certificate.userId?.name,
        studentEmail: certificate.userId?.email,
        courseTitle: certificate.courseId?.title,
        courseDescription: certificate.courseId?.description,
        issuedOn: certificate.issuedOn,
        verifiedAt: new Date(),
        verificationCount: (certificate.verificationCount || 0) + 1
      }
    });

  } catch (err) {
    console.error("[Certificate] Verify error:", err);
    return res.status(500).json({ 
      valid: false,
      message: "Failed to verify certificate", 
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error" 
    });
  }
});

/* =====================================================
    GET USER'S CERTIFICATES (Authenticated)
=====================================================*/
router.get("/my-certificates", isAuth, async (req, res) => {
  try {
    const userId = req.userId;

    console.log(`[Certificate] Fetching certificates for user: ${userId}`);

    const certificates = await Certificate.find({ 
      userId,
      isActive: true 
    })
      .populate("courseId", "title description thumbnail")
      .sort({ issuedOn: -1 })
      .lean();

    return res.status(200).json({
      certificates: certificates.map(cert => ({
        certificateId: cert.certificateId,
        courseId: cert.courseId?._id || cert.courseId,
        courseTitle: cert.courseId?.title,
        courseDescription: cert.courseId?.description,
        courseThumbnail: cert.courseId?.thumbnail,
        issuedOn: cert.issuedOn,
        verificationCount: cert.verificationCount || 0
      }))
    });

  } catch (err) {
    console.error("[Certificate] Get certificates error:", err);
    return res.status(500).json({ 
      message: "Failed to fetch certificates", 
      error: process.env.NODE_ENV === "development" ? err.message : "Internal server error" 
    });
  }
});

export default router;


