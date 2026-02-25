import PDFDocument from "pdfkit";
import Feedback from "../models/feedbackModel.js";
import User from "../models/userModel.js";

export const generateFeedbackReport = async (req, res) => {
  try {
    const { feedbackType, status, teacherId, startDate, endDate } = req.query;

    // Build filter
    let filter = {};
    if (feedbackType) filter.feedbackType = feedbackType;
    if (status) filter.status = status;
    if (teacherId) filter.teacherId = teacherId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Fetch feedbacks
    const feedbacks = await Feedback.find(filter)
      .populate("studentId", "name email class")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    // Calculate statistics
    const totalFeedbacks = feedbacks.length;
    const avgRating = feedbacks.length > 0
      ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(2)
      : 0;

    const teacherFeedbacks = feedbacks.filter(f => f.feedbackType === "teacher").length;
    const facilitiesFeedbacks = feedbacks.filter(f => f.feedbackType === "facilities").length;

    // Create PDF
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=feedback-report-${new Date().toISOString().split("T")[0]}.pdf`
    );
    doc.pipe(res);

    // Header
    doc.fontSize(24)
       .fillColor("#000000")
       .text("RCR - Feedback Report", { align: "center" });
    
    doc.fontSize(12)
       .fillColor("#666666")
       .text("RAJ CHEM REACTOR", { align: "center" });
    
    doc.moveDown(2);

    // Report Info
    doc.fontSize(10)
       .fillColor("#000000")
       .text(`Generated on: ${new Date().toLocaleString()}`, { align: "right" });
    
    doc.moveDown();

    // Statistics Section
    doc.fontSize(16)
       .fillColor("#FFD700")
       .text("Summary Statistics", { underline: true });
    
    doc.moveDown(0.5);
    doc.fontSize(11)
       .fillColor("#000000")
       .text(`Total Feedbacks: ${totalFeedbacks}`);
    doc.text(`Teacher Feedbacks: ${teacherFeedbacks}`);
    doc.text(`Facilities Feedbacks: ${facilitiesFeedbacks}`);
    doc.text(`Average Rating: ${avgRating}/5.0`);
    
    doc.moveDown(2);

    // Feedback Details
    doc.fontSize(16)
       .fillColor("#FFD700")
       .text("Feedback Details", { underline: true });
    
    doc.moveDown(1);

    if (feedbacks.length === 0) {
      doc.fontSize(12)
         .fillColor("#666666")
         .text("No feedback found for the selected criteria.", { align: "center" });
    } else {
      feedbacks.forEach((feedback, index) => {
        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
        }

        // Feedback Card
        doc.rect(50, doc.y, 495, 120)
           .lineWidth(1)
           .stroke("#CCCCCC");
        
        doc.fontSize(10)
           .fillColor("#000000")
           .text(`Feedback #${index + 1}`, 60, doc.y + 10, { bold: true });
        
        doc.fontSize(9)
           .fillColor("#666666")
           .text(`Date: ${new Date(feedback.createdAt).toLocaleDateString()}`, 60, doc.y + 25);
        
        doc.fontSize(9)
           .fillColor("#000000")
           .text(`Type: ${feedback.feedbackType === "teacher" ? "Teacher" : "Facilities"}`, 60, doc.y + 40);
        
        if (feedback.feedbackType === "teacher" && feedback.teacherName) {
          doc.text(`Teacher: ${feedback.teacherName}`, 60, doc.y + 55);
        }
        
        doc.text(`Rating: ${feedback.rating}/5`, 60, doc.y + 70);
        doc.text(`Status: ${feedback.status}`, 60, doc.y + 85);
        
        // Student info (if not anonymous)
        if (!feedback.isAnonymous && feedback.studentId) {
          const studentName = feedback.studentId.name || "Unknown";
          const studentClass = feedback.studentId.class || "";
          doc.text(`Student: ${studentName}${studentClass ? ` (${studentClass})` : ""}`, 300, doc.y + 25);
        } else {
          doc.text(`Student: Anonymous`, 300, doc.y + 25);
        }

        // Comment
        doc.fontSize(9)
           .fillColor("#333333")
           .text("Comment:", 60, doc.y + 100, { bold: true });
        
        doc.text(feedback.comment, 60, doc.y + 115, {
          width: 475,
          align: "left"
        });

        doc.y += 130;
        doc.moveDown(0.5);
      });
    }

    // Footer
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(8)
         .fillColor("#666666")
         .text(
           `Page ${i + 1} of ${totalPages} | RCR - RAJ CHEM REACTOR`,
           50,
           doc.page.height - 30,
           { align: "center" }
         );
    }

    doc.end();
  } catch (error) {
    console.error("Generate feedback report error:", error);
    res.status(500).json({ message: `Generate report failed: ${error.message}` });
  }
};

