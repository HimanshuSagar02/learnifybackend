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

const toPdfSafeText = (value, fallback = "") => {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || fallback;
};

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

    // Re-download should work even if enrollment arrays became inconsistent later.
    let certificate = await Certificate.findOne({ 
      userId, 
      courseId,
      isActive: true 
    });

    const isEnrolledInCourse = Array.isArray(course.enrolledStudents) &&
      course.enrolledStudents.some((id) => id?.toString?.() === userId.toString());
    const isEnrolledInUser = Array.isArray(user.enrolledCourses) &&
      user.enrolledCourses.some((id) => id?.toString?.() === courseId.toString());

    // Enforce enrollment only when issuing a brand-new certificate.
    if (!certificate && !isEnrolledInCourse && !isEnrolledInUser && user.role !== "admin") {
      return res.status(403).json({
        message: "You must be enrolled in the course to generate a certificate"
      });
    }

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
    
    const studentDisplayName = toPdfSafeText(user.name, "Student");
    const courseDisplayTitle = toPdfSafeText(course.title, "Course");
    const creatorDisplayName = toPdfSafeText(course.creator?.name, "Course Creator");

    // Generate QR Code with verification URL (fallback-safe)
    let qrBuffer = null;
    try {
      const qrData = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: "H",
        type: "image/png",
        quality: 0.92,
        margin: 1,
        width: 300
      });
      const base64Payload = String(qrData || "").split(",")[1];
      if (base64Payload) {
        qrBuffer = Buffer.from(base64Payload, "base64");
      }
    } catch (qrError) {
      console.warn("[Certificate] QR generation skipped:", qrError?.message || qrError);
    }

    /* ---------- PDF CONFIG ---------- */
    const doc = new PDFDocument({
      layout: "landscape",
      size: "A4",
      margin: 20,
    });
    const pdfChunks = [];
    doc.on("data", (chunk) => pdfChunks.push(chunk));
    const pdfReady = new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(pdfChunks)));
      doc.on("error", reject);
    });

    const safeStudentName = String(studentDisplayName || "student")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "student";
    const safeCourseName = String(courseDisplayTitle || "course")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "course";

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const colors = {
      primary: "#3B82F6",
      dark: "#0F172A",
      text: "#111827",
      muted: "#475569",
      border: "#93C5FD",
      lightBg: "#EFF6FF",
    };
    const issueDate = new Date(certificate.issuedOn).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    /* ---------- PREMIUM FRAME ---------- */
    doc.rect(0, 0, pageWidth, pageHeight).fill("#FFFFFF");
    doc.rect(18, 18, pageWidth - 36, pageHeight - 36).lineWidth(2.2).stroke(colors.dark);
    doc.rect(30, 30, pageWidth - 60, pageHeight - 60).lineWidth(1.2).stroke(colors.border);

    /* ---------- HEADER BAR ---------- */
    const innerX = 30;
    const innerY = 30;
    const innerW = pageWidth - 60;
    doc.rect(innerX, innerY, innerW, 72).fill(colors.dark);

    doc.font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#FFFFFF")
      .text("LEARNIFY", innerX + 28, innerY + 22, { characterSpacing: 2 });

    doc.font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#FFFFFF")
      .text("CERTIFICATE OF COMPLETION", 0, innerY + 22, { align: "center" });

    doc.font("Helvetica")
      .fontSize(10)
      .fillColor("#BFDBFE")
      .text("Premium Professional Certification", 0, innerY + 52, { align: "center" });

    /* ---------- WATERMARK ---------- */
    doc.save();
    doc.font("Helvetica-Bold")
      .fontSize(130)
      .fillColor("#DBEAFE")
      .opacity(0.16)
      .text("LEARNIFY", pageWidth / 2 - 240, pageHeight / 2 - 70);
    doc.restore();

    /* ---------- BODY ---------- */
    doc.font("Helvetica")
      .fontSize(16)
      .fillColor(colors.muted)
      .text("This certificate is proudly presented to", 0, 142, { align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(44)
      .fillColor(colors.text)
      .text(studentDisplayName.toUpperCase(), 74, 175, {
        align: "center",
        width: pageWidth - 148,
      });

    doc.moveTo(pageWidth / 2 - 210, 236)
      .lineTo(pageWidth / 2 + 210, 236)
      .lineWidth(1)
      .strokeColor("#CBD5E1")
      .stroke();

    doc.font("Helvetica")
      .fontSize(16)
      .fillColor(colors.muted)
      .text("for successfully completing the professional course", 0, 250, { align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(30)
      .fillColor(colors.primary)
      .text(courseDisplayTitle, 90, 281, {
        align: "center",
        width: pageWidth - 180,
      });

    /* ---------- CERTIFICATE META ---------- */
    const metaX = pageWidth / 2 - 190;
    const metaY = 350;
    const metaW = 380;
    const metaH = 60;
    doc.roundedRect(metaX, metaY, metaW, metaH, 9).fillAndStroke(colors.lightBg, "#BFDBFE");

    doc.font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#1E3A8A")
      .text("CERTIFICATE ID", metaX + 16, metaY + 14);

    doc.font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(colors.dark)
      .text(certificate.certificateId, metaX + 16, metaY + 30);

    doc.font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#1E3A8A")
      .text("ISSUE DATE", metaX + 235, metaY + 14);

    doc.font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(colors.dark)
      .text(issueDate, metaX + 235, metaY + 30);

    /* ---------- QR BLOCK ---------- */
    const qrSize = 92;
    const qrX = 76;
    const qrY = pageHeight - qrSize - 76;
    if (qrBuffer) {
      doc.roundedRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 10)
        .fillAndStroke("#FFFFFF", "#CBD5E1");
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(colors.dark)
        .text("SCAN TO VERIFY", qrX - 2, qrY + qrSize + 18, { width: qrSize + 8, align: "center" });
    } else {
      doc.roundedRect(qrX - 12, qrY - 2, qrSize + 24, 40, 8).fillAndStroke("#FFFFFF", "#CBD5E1");
      doc.font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(colors.dark)
        .text("VERIFY ONLINE", qrX - 2, qrY + 12, { width: qrSize + 8, align: "center" });
    }

    /* ---------- SIGNATURE ---------- */
    const signX = pageWidth - 290;
    const signY = pageHeight - 150;

    doc.moveTo(signX, signY).lineTo(signX + 215, signY).lineWidth(1).strokeColor("#94A3B8").stroke();

    // Built-in cursive-like style using italic font for a clean signature look.
    try {
      doc.font("Times-Italic")
        .fontSize(28)
        .fillColor(colors.dark)
        .text("Himanshu Sagar", signX, signY - 36, { width: 215, align: "center" });
    } catch {
      doc.font("Helvetica-Oblique")
        .fontSize(24)
        .fillColor(colors.dark)
        .text("Himanshu Sagar", signX, signY - 30, { width: 215, align: "center" });
    }

    doc.font("Helvetica")
      .fontSize(10)
      .fillColor(colors.muted)
      .text("Authorized Signatory", signX, signY + 9, { width: 215, align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(colors.primary)
      .text("Learnify", signX, signY + 24, { width: 215, align: "center" });

    doc.font("Helvetica")
      .fontSize(8.5)
      .fillColor("#64748B")
      .text(creatorDisplayName, signX, signY + 38, { width: 215, align: "center" });

    /* ---------- FOOTER ---------- */
    doc.font("Helvetica")
      .fontSize(8.5)
      .fillColor("#64748B")
      .text(`Verification URL: ${verifyUrl}`, 60, pageHeight - 40, {
        width: pageWidth - 120,
        align: "center",
      });

    doc.end();
    const pdfBuffer = await pdfReady;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeStudentName}-${safeCourseName}-certificate.pdf"`
    );
    res.status(200).send(pdfBuffer);

    console.log(`[Certificate] PDF generated successfully for certificate: ${certificate.certificateId}`);

  } catch (err) {
    console.error("[Certificate] Generate error:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to generate certificate",
        error: err?.message || "Internal server error",
      });
    }
    return res.end();
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


