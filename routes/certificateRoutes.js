import express from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Certificate from "../models/certificateModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";
import isAuth from "../middlewares/isAuth.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedCertificateLogoBuffer = null;
let didTryCertificateLogoLoad = false;

const resolveCertificateLogoPath = () => {
  const configuredPath = String(process.env.CERT_LOGO_PATH || "").trim();
  const candidates = [
    configuredPath
      ? path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(process.cwd(), configuredPath)
      : "",
    path.resolve(__dirname, "../../frontend/src/assets/logo.jpg"),
    path.resolve(process.cwd(), "frontend/src/assets/logo.jpg"),
  ].filter(Boolean);

  return candidates.find((candidatePath) => fs.existsSync(candidatePath)) || null;
};

const getCertificateLogoBuffer = async () => {
  if (didTryCertificateLogoLoad) {
    return cachedCertificateLogoBuffer;
  }

  didTryCertificateLogoLoad = true;
  const logoPath = resolveCertificateLogoPath();
  if (!logoPath) {
    return null;
  }

  try {
    cachedCertificateLogoBuffer = await fs.promises.readFile(logoPath);
    return cachedCertificateLogoBuffer;
  } catch (error) {
    console.warn("[Certificate] Unable to read logo file:", error?.message || error);
    return null;
  }
};

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
  logoBuffer,
}) =>
  createPdfBuffer((doc) => {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const colors = {
      primary: "#2D4FA3",
      dark: "#1E293B",
      text: "#1F2937",
      muted: "#475569",
      border: "#2D4FA3",
    };

    const drawCornerAccent = (x, y, horizontalDirection, verticalDirection) => {
      const arm = 22;
      doc.moveTo(x, y + verticalDirection * arm)
        .lineTo(x, y)
        .lineTo(x + horizontalDirection * arm, y)
        .lineWidth(4)
        .strokeColor(colors.border)
        .stroke();
    };

    doc.rect(0, 0, pageWidth, pageHeight).fill("#FFFFFF");
    doc.rect(18, 18, pageWidth - 36, pageHeight - 36).lineWidth(1.5).strokeColor(colors.border).stroke();
    doc.rect(26, 26, pageWidth - 52, pageHeight - 52).lineWidth(0.8).strokeColor(colors.border).stroke();

    drawCornerAccent(24, 24, 1, 1);
    drawCornerAccent(pageWidth - 24, 24, -1, 1);
    drawCornerAccent(24, pageHeight - 24, 1, -1);
    drawCornerAccent(pageWidth - 24, pageHeight - 24, -1, -1);

    doc.font("Helvetica-Oblique")
      .fontSize(14)
      .fillColor(colors.text)
      .text(`Certificate ID: ${certificateId}`, 52, 64);

    doc.font("Helvetica-Bold")
      .fontSize(34)
      .fillColor(colors.primary)
      .text("learnify", pageWidth - 248, 52, { width: 200, align: "right" });
    doc.font("Helvetica")
      .fontSize(10)
      .fillColor(colors.muted)
      .text("credentials that matter", pageWidth - 248, 84, { width: 200, align: "right" });

    const logoSize = 64;
    const logoX = pageWidth / 2 - logoSize / 2;
    const logoY = 48;
    const drawFallbackLogo = () => {
      doc.rect(logoX, logoY, logoSize, logoSize).fillAndStroke(colors.dark, colors.primary);
      doc.font("Helvetica-Bold")
        .fontSize(30)
        .fillColor("#FFFFFF")
        .text("L", logoX + logoSize / 2 - 9, logoY + 16);
    };

    if (logoBuffer) {
      doc.roundedRect(logoX - 2, logoY - 2, logoSize + 4, logoSize + 4, 4).fillAndStroke("#FFFFFF", "#CBD5E1");
      try {
        doc.image(logoBuffer, logoX, logoY, {
          fit: [logoSize, logoSize],
          align: "center",
          valign: "center",
        });
      } catch (error) {
        console.warn("[Certificate] Logo render fallback:", error?.message || error);
        drawFallbackLogo();
      }
    } else {
      drawFallbackLogo();
    }

    doc.font("Helvetica-Bold")
      .fontSize(38)
      .fillColor(colors.text)
      .text(organisationName, 0, 132, { align: "center" });
    doc.font("Helvetica-Oblique")
      .fontSize(15)
      .fillColor(colors.muted)
      .text(`Supported by online education standards | ${organisationWebsite}`, 0, 176, { align: "center" });
    doc.font("Helvetica")
      .fontSize(12.5)
      .fillColor(colors.muted)
      .text(`Contact: ${organisationEmail} | ${organisationSocial}`, 0, 197, { align: "center" });

    doc.font("Helvetica")
      .fontSize(50)
      .fillColor(colors.primary)
      .text("CERTIFICATE OF COMPLETION", 0, 220, { align: "center" });

    doc.font("Helvetica")
      .fontSize(20)
      .fillColor(colors.text)
      .text("This is to certify that Mr./Ms.", 0, 280, { align: "center" });
    doc.font("Helvetica-Bold")
      .fontSize(48)
      .fillColor("#111827")
      .text(studentName, 65, 310, { align: "center", width: pageWidth - 130 });

    doc.font("Helvetica")
      .fontSize(18)
      .fillColor(colors.text)
      .text("has successfully completed the online", 0, 365, { align: "center" });
    doc.font("Helvetica-Bold")
      .fontSize(35)
      .fillColor("#1E3A8A")
      .text(`"${courseTitle}"`, 85, 389, { align: "center", width: pageWidth - 170 });

    doc.font("Helvetica")
      .fontSize(14.5)
      .fillColor(colors.muted)
      .text(`Mode: ${courseMode} | Total Hours: ${totalHoursLabel}`, 0, 437, { align: "center" });

    doc.font("Helvetica")
      .fontSize(10.5)
      .fillColor(colors.text)
      .text(`Registration ID: ${registrationId}`, 58, 458)
      .text(`Email: ${studentEmail || "Not provided"}`, 58, 474)
      .text(`Program Director: ${creatorName}`, 58, 490);

    doc.font("Helvetica")
      .fontSize(10.5)
      .fillColor(colors.text)
      .text(`Certificate Number: ${certificateNumber}`, 315, 458)
      .text(`Issued On: ${issueDateLabel}`, 315, 474)
      .text(`Verify at: ${verifyUrl}`, 315, 490, { width: 255 });

    const qrX = pageWidth - 150;
    const qrY = 448;
    const qrSize = 86;
    if (qrBuffer) {
      doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 8).fillAndStroke("#FFFFFF", "#CBD5E1");
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.font("Helvetica-Bold")
        .fontSize(8.8)
        .fillColor(colors.dark)
        .text("SCAN TO VERIFY", qrX - 3, qrY + qrSize + 5, { width: qrSize + 6, align: "center" });
    }

    const sealX = qrX - 52;
    const sealY = 490;
    doc.circle(sealX, sealY, 28).fillAndStroke("#DBEAFE", colors.primary);
    doc.font("Helvetica-Bold")
      .fontSize(7.2)
      .fillColor(colors.primary)
      .text("DIGITAL", sealX - 15, sealY - 11, { width: 30, align: "center" })
      .text("SEAL", sealX - 15, sealY - 1, { width: 30, align: "center" })
      .text("VERIFIED", sealX - 15, sealY + 9, { width: 30, align: "center" });

    const leftSignX = 95;
    const rightSignX = pageWidth - 300;
    const signY = 510;
    const signW = 190;
    doc.moveTo(leftSignX, signY).lineTo(leftSignX + signW, signY).lineWidth(1).strokeColor("#94A3B8").stroke();
    doc.moveTo(rightSignX, signY).lineTo(rightSignX + signW, signY).lineWidth(1).strokeColor("#94A3B8").stroke();

    doc.font("Times-Italic")
      .fontSize(24)
      .fillColor(colors.text)
      .text("Nitin", leftSignX, signY - 28, { width: signW, align: "center" });
    doc.font("Times-Italic")
      .fontSize(24)
      .fillColor(colors.text)
      .text("Himanshu Sagar", rightSignX, signY - 28, { width: signW, align: "center" });

    doc.font("Helvetica")
      .fontSize(9.2)
      .fillColor(colors.muted)
      .text("Administrator", leftSignX, signY + 5, { width: signW, align: "center" })
      .text(organisationName, leftSignX, signY + 17, { width: signW, align: "center" })
      .text("Administrator", rightSignX, signY + 5, { width: signW, align: "center" })
      .text(organisationName, rightSignX, signY + 17, { width: signW, align: "center" });

    doc.font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor(colors.muted)
      .text(
        "This is an online certification issued through Learnify secure verification system.",
        0,
        pageHeight - 34,
        { align: "center" }
      );
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
    const logoBuffer = await getCertificateLogoBuffer();

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
      logoBuffer,
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


