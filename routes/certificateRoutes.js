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

const createPdfBuffer = (render) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      layout: "landscape",
      size: "A4",
      margin: 20,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      render(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const formatDateLabel = (value) =>
  new Date(value || Date.now()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const buildStructuredCertificatePdf = async ({
  organisationName,
  organisationWebsite,
  organisationEmail,
  organisationSocial,
  studentName,
  studentEmail,
  registrationId,
  courseTitle,
  courseMode,
  totalHoursLabel,
  certificateId,
  certificateNumber,
  issueDateLabel,
  verifyUrl,
  creatorName,
  qrBuffer,
}) =>
  createPdfBuffer((doc) => {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const colors = {
      primary: "#3B82F6",
      dark: "#0F172A",
      text: "#111827",
      muted: "#475569",
      light: "#EFF6FF",
      border: "#BFDBFE",
    };

    const frameX = 20;
    const frameY = 20;
    const frameW = pageWidth - 40;
    const frameH = pageHeight - 40;

    doc.rect(0, 0, pageWidth, pageHeight).fill("#FFFFFF");
    doc.roundedRect(frameX, frameY, frameW, frameH, 10).lineWidth(1.8).stroke(colors.dark);
    doc.roundedRect(frameX + 10, frameY + 10, frameW - 20, frameH - 20, 8).lineWidth(0.9).stroke(colors.border);

    const headerX = frameX + 10;
    const headerY = frameY + 10;
    const headerW = frameW - 20;
    const headerH = 84;
    doc.roundedRect(headerX, headerY, headerW, headerH, 8).fill(colors.dark);

    const logoCenterX = headerX + 36;
    const logoCenterY = headerY + 42;
    doc.circle(logoCenterX, logoCenterY, 22).fillAndStroke(colors.primary, "#93C5FD");
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#FFFFFF").text("L", logoCenterX - 6, logoCenterY - 11);

    doc.font("Helvetica-Bold")
      .fontSize(15)
      .fillColor("#FFFFFF")
      .text(organisationName, headerX + 70, headerY + 18, { width: headerW - 270 });

    doc.font("Helvetica")
      .fontSize(9.5)
      .fillColor("#BFDBFE")
      .text(organisationWebsite, headerX + 70, headerY + 40, { width: headerW - 270 });

    doc.font("Helvetica")
      .fontSize(9.5)
      .fillColor("#BFDBFE")
      .text(organisationEmail, headerX + 70, headerY + 54, { width: headerW - 270 });

    doc.font("Helvetica")
      .fontSize(9.5)
      .fillColor("#BFDBFE")
      .text(`Social: ${organisationSocial}`, headerX + 70, headerY + 68, { width: headerW - 270 });

    doc.font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#93C5FD")
      .text("ONLINE ORGANISATION CERTIFICATE", headerX + headerW - 255, headerY + 22, {
        width: 235,
        align: "right",
      });

    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#DBEAFE")
      .text(`Certificate No: ${certificateNumber}`, headerX + headerW - 255, headerY + 44, {
        width: 235,
        align: "right",
      });

    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#DBEAFE")
      .text(`Issued: ${issueDateLabel}`, headerX + headerW - 255, headerY + 60, {
        width: 235,
        align: "right",
      });

    doc.font("Helvetica-Bold")
      .fontSize(34)
      .fillColor(colors.text)
      .text("Certificate of Completion", 0, 129, { align: "center" });

    doc.font("Helvetica")
      .fontSize(13)
      .fillColor(colors.muted)
      .text("This is to certify that", 0, 170, { align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(36)
      .fillColor(colors.primary)
      .text(studentName, 70, 197, { align: "center", width: pageWidth - 140 });

    doc.moveTo(pageWidth / 2 - 230, 247)
      .lineTo(pageWidth / 2 + 230, 247)
      .lineWidth(1)
      .strokeColor("#CBD5E1")
      .stroke();

    doc.font("Helvetica")
      .fontSize(12.5)
      .fillColor(colors.muted)
      .text(
        `has successfully completed the online program "${courseTitle}" conducted by ${organisationName}.`,
        100,
        257,
        { width: pageWidth - 200, align: "center" }
      );

    const detailX = 58;
    const detailY = 314;
    const detailW = pageWidth - 116;
    const detailH = 128;
    const midX = detailX + detailW / 2;
    doc.roundedRect(detailX, detailY, detailW, detailH, 8).fillAndStroke("#F8FAFC", "#CBD5E1");
    doc.moveTo(midX, detailY + 10).lineTo(midX, detailY + detailH - 10).lineWidth(0.8).strokeColor("#D1D5DB").stroke();

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#1E3A8A").text("CERTIFICATE HOLDER DETAILS", detailX + 16, detailY + 14);
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Full Name: ${studentName}`, detailX + 16, detailY + 34, { width: detailW / 2 - 28 });
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Registration ID: ${registrationId}`, detailX + 16, detailY + 52, { width: detailW / 2 - 28 });
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Email: ${studentEmail || "Not provided"}`, detailX + 16, detailY + 70, { width: detailW / 2 - 28 });
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Certificate ID: ${certificateId}`, detailX + 16, detailY + 88, { width: detailW / 2 - 28 });

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#1E3A8A").text("PROGRAM DETAILS", midX + 16, detailY + 14);
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Course: ${courseTitle}`, midX + 16, detailY + 34, { width: detailW / 2 - 30 });
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Mode: ${courseMode}`, midX + 16, detailY + 52, { width: detailW / 2 - 30 });
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Total Hours: ${totalHoursLabel}`, midX + 16, detailY + 70, { width: detailW / 2 - 30 });
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Program Director: ${creatorName}`, midX + 16, detailY + 88, { width: detailW / 2 - 30 });

    const verifyX = 58;
    const verifyY = 456;
    const verifyW = pageWidth - 330;
    const verifyH = 95;
    doc.roundedRect(verifyX, verifyY, verifyW, verifyH, 8).fillAndStroke(colors.light, "#BFDBFE");
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#1E3A8A").text("VERIFICATION DETAILS", verifyX + 14, verifyY + 12);
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Certificate Number: ${certificateNumber}`, verifyX + 14, verifyY + 30);
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Certificate ID: ${certificateId}`, verifyX + 14, verifyY + 46);
    doc.font("Helvetica").fontSize(10.5).fillColor(colors.text).text(`Verify: ${verifyUrl}`, verifyX + 14, verifyY + 62, {
      width: verifyW - 24,
    });

    const sealX = verifyX + verifyW - 78;
    const sealY = verifyY + 48;
    doc.circle(sealX, sealY, 30).fillAndStroke("#DBEAFE", "#3B82F6");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1E3A8A").text("DIGITAL", sealX - 16, sealY - 12, { width: 32, align: "center" });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#1E3A8A").text("SEAL", sealX - 16, sealY - 2, { width: 32, align: "center" });
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#1E3A8A").text("VERIFIED", sealX - 16, sealY + 8, { width: 32, align: "center" });

    const qrX = pageWidth - 248;
    const qrY = 451;
    if (qrBuffer) {
      doc.roundedRect(qrX, qrY, 108, 108, 10).fillAndStroke("#FFFFFF", "#CBD5E1");
      doc.image(qrBuffer, qrX + 8, qrY + 8, { width: 92, height: 92 });
      doc.font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(colors.dark)
        .text("SCAN TO VERIFY", qrX, qrY + 112, { width: 108, align: "center" });
    }

    const signBaseY = 501;
    const sign1X = pageWidth - 132;
    const sign2X = pageWidth - 242;

    doc.moveTo(sign2X, signBaseY).lineTo(sign2X + 94, signBaseY).lineWidth(0.8).strokeColor("#94A3B8").stroke();
    doc.moveTo(sign1X, signBaseY).lineTo(sign1X + 94, signBaseY).lineWidth(0.8).strokeColor("#94A3B8").stroke();

    doc.font("Times-Italic").fontSize(16).fillColor(colors.dark).text("Nitin", sign2X, signBaseY - 24, { width: 94, align: "center" });
    doc.font("Times-Italic").fontSize(16).fillColor(colors.dark).text("Himanshu Sagar", sign1X, signBaseY - 24, { width: 94, align: "center" });

    doc.font("Helvetica")
      .fontSize(7.8)
      .fillColor(colors.muted)
      .text("Administrator", sign2X, signBaseY + 4, { width: 94, align: "center" });
    doc.font("Helvetica")
      .fontSize(7.8)
      .fillColor(colors.muted)
      .text("Administrator", sign1X, signBaseY + 4, { width: 94, align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(8.2)
      .fillColor(colors.primary)
      .text(organisationName, sign2X - 8, signBaseY + 15, { width: 210, align: "center" });
  });

const buildFallbackCertificatePdf = async ({
  studentName,
  courseTitle,
  certificateId,
  issuedOn,
  verifyUrl,
}) =>
  createPdfBuffer((doc) => {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const issueDate = new Date(issuedOn || Date.now()).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    doc.rect(0, 0, pageWidth, pageHeight).fill("#FFFFFF");
    doc.rect(18, 18, pageWidth - 36, pageHeight - 36).lineWidth(2).stroke("#0F172A");
    doc.rect(30, 30, pageWidth - 60, 64).fill("#0F172A");

    doc.font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#FFFFFF")
      .text("CERTIFICATE OF COMPLETION", 0, 48, { align: "center" });

    doc.font("Helvetica")
      .fontSize(14)
      .fillColor("#475569")
      .text("This certifies that", 0, 160, { align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(36)
      .fillColor("#111827")
      .text(studentName, 0, 195, { align: "center" });

    doc.font("Helvetica")
      .fontSize(15)
      .fillColor("#475569")
      .text("has successfully completed the course", 0, 250, { align: "center" });

    doc.font("Helvetica-Bold")
      .fontSize(25)
      .fillColor("#3B82F6")
      .text(courseTitle, 90, 282, { align: "center", width: pageWidth - 180 });

    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#1E3A8A")
      .text(`Certificate ID: ${certificateId}`, 70, pageHeight - 95);

    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#1E3A8A")
      .text(`Issued On: ${issueDate}`, 70, pageHeight - 75);

    doc.font("Helvetica")
      .fontSize(9)
      .fillColor("#64748B")
      .text(`Verification URL: ${verifyUrl}`, 60, pageHeight - 42, {
        width: pageWidth - 120,
        align: "center",
      });

    doc.moveTo(pageWidth - 300, pageHeight - 120)
      .lineTo(pageWidth - 90, pageHeight - 120)
      .lineWidth(1)
      .strokeColor("#94A3B8")
      .stroke();

    doc.font("Times-Italic")
      .fontSize(25)
      .fillColor("#0F172A")
      .text("Himanshu Sagar", pageWidth - 305, pageHeight - 154, {
        width: 220,
        align: "center",
      });

    doc.font("Helvetica")
      .fontSize(10)
      .fillColor("#475569")
      .text("Authorized Signatory", pageWidth - 305, pageHeight - 108, {
        width: 220,
        align: "center",
      });
  });

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
  let fallbackPayload = null;
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
      try {
        certificate = await Certificate.create({ userId, courseId });
        console.log(`[Certificate] Created new certificate with ID: ${certificate.certificateId}`);
      } catch (createError) {
        // Handle rare race conditions where duplicate certificate is created concurrently.
        if (createError?.code === 11000) {
          certificate = await Certificate.findOne({ userId, courseId, isActive: true });
          if (!certificate) {
            throw createError;
          }
          console.warn("[Certificate] Duplicate create avoided by reusing existing certificate");
        } else {
          throw createError;
        }
      }
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

    const safeStudentName = String(studentDisplayName || "student")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "student";
    const safeCourseName = String(courseDisplayTitle || "course")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "course";

    fallbackPayload = {
      studentName: studentDisplayName,
      courseTitle: courseDisplayTitle,
      certificateId: certificate.certificateId,
      issuedOn: certificate.issuedOn,
      verifyUrl,
      safeStudentName,
      safeCourseName,
    };

    const organisationName = toPdfSafeText(
      process.env.CERT_ORG_NAME || process.env.ORG_NAME,
      "Learnify"
    );
    const organisationWebsite = toPdfSafeText(frontendUrl, "https://learnifyedu.store");
    const organisationEmail = toPdfSafeText(
      process.env.CERT_ORG_EMAIL || process.env.ORG_EMAIL || process.env.SMTP_USER,
      "support@learnifyedu.store"
    );
    const organisationSocial = toPdfSafeText(
      process.env.CERT_ORG_SOCIAL || process.env.ORG_SOCIAL,
      "@learnifyedu"
    );
    const registrationId = toPdfSafeText(
      user.registrationId || `REG-${String(user._id).slice(-8).toUpperCase()}`
    );
    const certificateNumber = toPdfSafeText(`CERT-${certificate.certificateId}`, certificate.certificateId);
    const totalHoursLabel = Array.isArray(course.lectures) && course.lectures.length > 0
      ? `${course.lectures.length} learning module${course.lectures.length > 1 ? "s" : ""}`
      : "As per curriculum";
    const issueDateLabel = formatDateLabel(certificate.issuedOn);
    const studentEmail = toPdfSafeText(user.email);

    const pdfBuffer = await buildStructuredCertificatePdf({
      organisationName,
      organisationWebsite,
      organisationEmail,
      organisationSocial,
      studentName: studentDisplayName,
      studentEmail,
      registrationId,
      courseTitle: courseDisplayTitle,
      courseMode: "Online / Virtual",
      totalHoursLabel,
      certificateId: certificate.certificateId,
      certificateNumber,
      issueDateLabel,
      verifyUrl,
      creatorName: creatorDisplayName,
      qrBuffer,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeStudentName}-${safeCourseName}-certificate.pdf"`
    );
    res.status(200).send(pdfBuffer);

    console.log(`[Certificate] PDF generated successfully for certificate: ${certificate.certificateId}`);

  } catch (err) {
    console.error("[Certificate] Generate error:", err);

    if (!res.headersSent && fallbackPayload) {
      try {
        const fallbackPdfBuffer = await buildFallbackCertificatePdf({
          studentName: fallbackPayload.studentName,
          courseTitle: fallbackPayload.courseTitle,
          certificateId: fallbackPayload.certificateId,
          issuedOn: fallbackPayload.issuedOn,
          verifyUrl: fallbackPayload.verifyUrl,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fallbackPayload.safeStudentName}-${fallbackPayload.safeCourseName}-certificate.pdf"`
        );
        return res.status(200).send(fallbackPdfBuffer);
      } catch (fallbackError) {
        console.error("[Certificate] Fallback PDF generation failed:", fallbackError);
      }
    }

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


