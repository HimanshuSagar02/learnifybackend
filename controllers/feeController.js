import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import PDFDocument from "pdfkit";
import FeeRecord from "../models/feeRecordModel.js";
import FeePaymentOrder from "../models/feePaymentOrderModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";

const ALLOWED_STATUSES = new Set(["pending", "partial", "paid", "overdue"]);
const ALLOWED_PAYMENT_MODES = new Set(["cash", "upi", "card", "bank-transfer", "online", "other"]);

const razorpayInstance =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const parsePositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return round2(parsed);
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const computeStatus = (record) => {
  const due = Math.max(0, round2(record.dueAmount));
  if (due <= 0) return "paid";
  if (round2(record.amountPaid) > 0) return "partial";
  if (record.dueDate && new Date(record.dueDate).getTime() < Date.now()) return "overdue";
  return "pending";
};

const normalizeRecord = (record) => {
  const source = record?.toObject ? record.toObject() : record;
  const finalFee = round2(source?.finalFee || 0);
  const amountPaid = round2(source?.amountPaid || 0);
  const dueAmount = Math.max(0, round2(finalFee - amountPaid));
  const status = computeStatus({
    ...source,
    finalFee,
    amountPaid,
    dueAmount,
  });

  return {
    ...source,
    finalFee,
    amountPaid,
    dueAmount,
    status,
  };
};

const getSummaryFromRecords = (records) => {
  const summary = {
    totalFinalFee: 0,
    totalPaid: 0,
    totalDue: 0,
    pendingCount: 0,
    partialCount: 0,
    paidCount: 0,
    overdueCount: 0,
  };

  records.forEach((item) => {
    const normalized = normalizeRecord(item);
    summary.totalFinalFee += normalized.finalFee;
    summary.totalPaid += normalized.amountPaid;
    summary.totalDue += normalized.dueAmount;

    if (normalized.status === "pending") summary.pendingCount += 1;
    if (normalized.status === "partial") summary.partialCount += 1;
    if (normalized.status === "paid") summary.paidCount += 1;
    if (normalized.status === "overdue") summary.overdueCount += 1;
  });

  return {
    totalFinalFee: round2(summary.totalFinalFee),
    totalPaid: round2(summary.totalPaid),
    totalDue: round2(summary.totalDue),
    pendingCount: summary.pendingCount,
    partialCount: summary.partialCount,
    paidCount: summary.paidCount,
    overdueCount: summary.overdueCount,
  };
};

const applyPaymentToRecord = (record, { amount, paymentMode, referenceId, note, recordedBy, razorpayOrderId, razorpayPaymentId }) => {
  const payableAmount = round2(amount);
  if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
    throw new Error("Invalid payment amount");
  }

  const dueAmount = Math.max(0, round2(record.finalFee - record.amountPaid));
  if (payableAmount - dueAmount > 0.001) {
    throw new Error("Amount cannot exceed due amount");
  }

  record.installments.push({
    amount: payableAmount,
    paidAt: new Date(),
    paymentMode: ALLOWED_PAYMENT_MODES.has(paymentMode) ? paymentMode : "cash",
    referenceId: String(referenceId || "").trim(),
    note: String(note || "").trim(),
    recordedBy: recordedBy || null,
    razorpayOrderId: String(razorpayOrderId || "").trim(),
    razorpayPaymentId: String(razorpayPaymentId || "").trim(),
  });

  record.amountPaid = round2(record.amountPaid + payableAmount);
  record.dueAmount = Math.max(0, round2(record.finalFee - record.amountPaid));
  record.status = computeStatus(record);
};

const ensureStudentEnrollment = async (studentId, courseId) => {
  if (!courseId || !isValidObjectId(courseId)) {
    return { grantedNow: false, alreadyGranted: false };
  }

  const [student, course] = await Promise.all([
    User.findById(studentId),
    Course.findById(courseId),
  ]);

  if (!student) {
    throw new Error("Student not found");
  }
  if (!course) {
    throw new Error("Course not found");
  }

  const studentHasCourse = Array.isArray(student.enrolledCourses)
    ? student.enrolledCourses.some((id) => id.toString() === course._id.toString())
    : false;
  const courseHasStudent = Array.isArray(course.enrolledStudents)
    ? course.enrolledStudents.some((id) => id.toString() === student._id.toString())
    : false;

  if (studentHasCourse && courseHasStudent) {
    return { grantedNow: false, alreadyGranted: true };
  }

  if (!studentHasCourse) {
    student.enrolledCourses.push(course._id);
  }
  if (!courseHasStudent) {
    course.enrolledStudents.push(student._id);
  }

  await Promise.all([student.save(), course.save()]);
  return { grantedNow: true, alreadyGranted: false };
};

export const getAdminFeeRecords = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 10));
    const statusFilter = String(req.query?.status || "").trim();
    const search = String(req.query?.search || "").trim();

    const filter = {};
    if (statusFilter && ALLOWED_STATUSES.has(statusFilter)) {
      filter.status = statusFilter;
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      const students = await User.find({
        role: "student",
        $or: [{ name: searchRegex }, { email: searchRegex }],
      })
        .select("_id")
        .lean();

      const studentIds = students.map((item) => item._id);
      if (!studentIds.length) {
        return res.status(200).json({
          records: [],
          summary: getSummaryFromRecords([]),
          pagination: { page, totalPages: 1, totalRecords: 0 },
        });
      }
      filter.studentId = { $in: studentIds };
    }

    const [totalRecords, pageRecordsRaw, allFilteredForSummaryRaw] = await Promise.all([
      FeeRecord.countDocuments(filter),
      FeeRecord.find(filter)
        .populate("studentId", "name email class")
        .populate("courseId", "title")
        .sort({ createdAt: -1, dueDate: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      FeeRecord.find(filter).select("finalFee amountPaid dueAmount status dueDate").lean(),
    ]);

    const pageRecords = pageRecordsRaw.map((item) => normalizeRecord(item));
    const summary = getSummaryFromRecords(allFilteredForSummaryRaw);
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

    return res.status(200).json({
      records: pageRecords,
      summary,
      pagination: {
        page,
        totalPages,
        totalRecords,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch fee records",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const createFeePlan = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      title,
      planType,
      monthlyInstallments,
      totalFee,
      discount,
      initialPaid,
      dueDate,
      centerName,
      notes,
      paymentMode,
      paymentReference,
      grantPortalAccess,
    } = req.body || {};

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: "Valid studentId is required" });
    }

    const student = await User.findById(studentId).select("role");
    if (!student || student.role !== "student") {
      return res.status(400).json({ message: "Selected user is not a student" });
    }

    if (courseId && !isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const parsedTotalFee = parsePositiveNumber(totalFee, -1);
    if (parsedTotalFee <= 0) {
      return res.status(400).json({ message: "Total fee must be greater than 0" });
    }

    const parsedDiscount = parsePositiveNumber(discount, 0);
    const finalTotalFee = round2(parsedTotalFee - parsedDiscount);
    if (finalTotalFee <= 0) {
      return res.status(400).json({ message: "Final fee must be greater than 0" });
    }

    const feePlanType = String(planType || "one-time") === "monthly" ? "monthly" : "one-time";
    const installmentsCount =
      feePlanType === "monthly"
        ? Math.min(60, Math.max(1, Number(monthlyInstallments) || 1))
        : 1;

    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (dueDate && Number.isNaN(parsedDueDate?.getTime())) {
      return res.status(400).json({ message: "Invalid dueDate" });
    }

    const feeChunks = [];
    if (installmentsCount === 1) {
      feeChunks.push(finalTotalFee);
    } else {
      const perInstallment = round2(finalTotalFee / installmentsCount);
      let remaining = finalTotalFee;
      for (let i = 0; i < installmentsCount; i += 1) {
        if (i === installmentsCount - 1) {
          feeChunks.push(round2(remaining));
        } else {
          feeChunks.push(perInstallment);
          remaining = round2(remaining - perInstallment);
        }
      }
    }

    const recordsPayload = feeChunks.map((feeAmount, index) => {
      const thisDueDate = parsedDueDate ? new Date(parsedDueDate) : null;
      if (thisDueDate) {
        thisDueDate.setMonth(thisDueDate.getMonth() + index);
      }

      const draft = {
        studentId,
        courseId: courseId || null,
        title: String(title || "Coaching Fee").trim() || "Coaching Fee",
        planType: feePlanType,
        installmentNumber: index + 1,
        totalInstallments: installmentsCount,
        totalFee: parsedTotalFee,
        discount: parsedDiscount,
        finalFee: round2(feeAmount),
        amountPaid: 0,
        dueAmount: round2(feeAmount),
        dueDate: thisDueDate,
        centerName: String(centerName || "").trim(),
        notes: String(notes || "").trim(),
        status: "pending",
        currency: "INR",
        createdBy: req.userId || null,
        updatedBy: req.userId || null,
      };
      draft.status = computeStatus(draft);
      return draft;
    });

    const createdRecords = await FeeRecord.insertMany(recordsPayload);

    let remainingInitialPaid = parsePositiveNumber(initialPaid, 0);
    if (remainingInitialPaid > 0) {
      for (const record of createdRecords) {
        const normalized = normalizeRecord(record);
        if (remainingInitialPaid <= 0) break;
        if (normalized.dueAmount <= 0) continue;

        const payNow = Math.min(remainingInitialPaid, normalized.dueAmount);
        applyPaymentToRecord(record, {
          amount: payNow,
          paymentMode: paymentMode || "cash",
          referenceId: paymentReference || "",
          note: "Initial payment",
          recordedBy: req.userId || null,
        });
        record.updatedBy = req.userId || null;
        await record.save();
        remainingInitialPaid = round2(remainingInitialPaid - payNow);
      }
    }

    let portalAccess = { grantedNow: false, alreadyGranted: false };
    if (courseId && grantPortalAccess) {
      portalAccess = await ensureStudentEnrollment(studentId, courseId);
    }

    return res.status(201).json({
      message: "Fee plan created successfully",
      createdCount: createdRecords.length,
      portalAccess,
    });
  } catch (error) {
    const safeMessage =
      error.message === "Student not found" || error.message === "Course not found"
        ? error.message
        : "Failed to create fee plan";
    return res.status(500).json({
      message: safeMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const addFeePaymentByAdmin = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { amount, paymentMode, referenceId, note } = req.body || {};

    if (!isValidObjectId(recordId)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    const record = await FeeRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    const normalized = normalizeRecord(record);
    const paymentAmount = parsePositiveNumber(amount, -1);
    if (paymentAmount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }
    if (paymentAmount - normalized.dueAmount > 0.001) {
      return res.status(400).json({ message: "Amount cannot exceed due amount" });
    }

    applyPaymentToRecord(record, {
      amount: paymentAmount,
      paymentMode,
      referenceId,
      note,
      recordedBy: req.userId || null,
    });
    record.updatedBy = req.userId || null;
    await record.save();

    return res.status(200).json({
      message: "Payment recorded successfully",
      record: normalizeRecord(record),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to record payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getMyFeeRecords = async (req, res) => {
  try {
    const recordsRaw = await FeeRecord.find({ studentId: req.userId })
      .populate("courseId", "title")
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    const records = recordsRaw.map((item) => normalizeRecord(item));
    const summary = getSummaryFromRecords(records);

    return res.status(200).json({ records, summary });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch fee records",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const createOnlineFeeOrder = async (req, res) => {
  try {
    const { recordId } = req.params;
    const paymentAmount = parsePositiveNumber(req.body?.amount, 0);

    if (!razorpayInstance) {
      return res.status(503).json({
        message: "Online payment is not configured",
      });
    }
    if (!isValidObjectId(recordId)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    const record = await FeeRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    if (record.studentId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only pay your own fee record" });
    }

    const normalized = normalizeRecord(record);
    const amountToPay = paymentAmount > 0 ? paymentAmount : normalized.dueAmount;

    if (amountToPay <= 0) {
      return res.status(400).json({ message: "No due amount for this fee record" });
    }
    if (amountToPay - normalized.dueAmount > 0.001) {
      return res.status(400).json({ message: "Amount cannot exceed due amount" });
    }

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(amountToPay * 100),
      currency: "INR",
      receipt: `fee-${record._id.toString().slice(-8)}-${Date.now()}`,
    });

    await FeePaymentOrder.create({
      feeRecordId: record._id,
      studentId: req.userId,
      amount: amountToPay,
      currency: razorpayOrder.currency || "INR",
      razorpayOrderId: razorpayOrder.id,
      status: "created",
    });

    return res.status(201).json({
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || "INR",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create online payment order",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const verifyOnlineFeePayment = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!isValidObjectId(recordId)) {
      return res.status(400).json({ message: "Invalid record id" });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Payment verification payload is incomplete" });
    }

    const record = await FeeRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: "Fee record not found" });
    }
    if (record.studentId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only verify your own fee payment" });
    }

    const paymentOrder = await FeePaymentOrder.findOne({
      feeRecordId: record._id,
      studentId: req.userId,
      razorpayOrderId: razorpay_order_id,
    });

    if (!paymentOrder) {
      return res.status(404).json({ message: "Payment order not found" });
    }
    if (paymentOrder.status === "paid") {
      return res.status(200).json({ message: "Payment already verified" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      paymentOrder.status = "failed";
      paymentOrder.failureReason = "Invalid payment signature";
      paymentOrder.razorpayPaymentId = razorpay_payment_id;
      paymentOrder.razorpaySignature = razorpay_signature;
      await paymentOrder.save();
      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const normalized = normalizeRecord(record);
    if (paymentOrder.amount - normalized.dueAmount > 0.001) {
      paymentOrder.status = "failed";
      paymentOrder.failureReason = "Paid amount exceeds current due amount";
      paymentOrder.razorpayPaymentId = razorpay_payment_id;
      paymentOrder.razorpaySignature = razorpay_signature;
      await paymentOrder.save();
      return res.status(400).json({ message: "Payment amount exceeds due amount" });
    }

    applyPaymentToRecord(record, {
      amount: paymentOrder.amount,
      paymentMode: "online",
      referenceId: razorpay_payment_id,
      note: "Online payment via Razorpay",
      recordedBy: req.userId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });
    record.updatedBy = req.userId;

    paymentOrder.status = "paid";
    paymentOrder.razorpayPaymentId = razorpay_payment_id;
    paymentOrder.razorpaySignature = razorpay_signature;

    await Promise.all([record.save(), paymentOrder.save()]);

    return res.status(200).json({
      message: "Fee payment verified successfully",
      record: normalizeRecord(record),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Fee payment verification failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const generateFeeReceipt = async (req, res) => {
  try {
    const { recordId, paymentId } = req.params;

    if (!isValidObjectId(recordId) || !isValidObjectId(paymentId)) {
      return res.status(400).json({ message: "Invalid record/payment id" });
    }

    const [record, requester] = await Promise.all([
      FeeRecord.findById(recordId)
        .populate("studentId", "name email")
        .populate("courseId", "title")
        .lean(),
      User.findById(req.userId).select("role"),
    ]);

    if (!record) {
      return res.status(404).json({ message: "Fee record not found" });
    }
    if (!requester) {
      return res.status(404).json({ message: "Requester not found" });
    }

    const isOwner = record.studentId?._id?.toString() === req.userId.toString();
    const isAdminOrEducator = requester.role === "admin" || requester.role === "educator";
    if (!isOwner && !isAdminOrEducator) {
      return res.status(403).json({ message: "You are not allowed to access this receipt" });
    }

    const payment = (record.installments || []).find((item) => item._id?.toString() === paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment entry not found" });
    }

    const receiptId = `LEARNIFY-FEE-${record._id.toString().slice(-6)}-${payment._id.toString().slice(-6)}`;

    const doc = new PDFDocument({
      layout: "portrait",
      size: "A4",
      margin: 48,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=Fee-Receipt-${receiptId}.pdf`);
    doc.pipe(res);

    doc.fontSize(22).font("Helvetica-Bold").fillColor("#000").text("Learnify", {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.fontSize(16).font("Helvetica-Bold").text("FEE PAYMENT RECEIPT", { align: "center" });

    doc.moveDown(1.2);
    doc.fontSize(11).font("Helvetica-Bold").text("Receipt ID:", 60, 150);
    doc.font("Helvetica").text(receiptId, 190, 150);

    doc.font("Helvetica-Bold").text("Generated On:", 60, 172);
    doc.font("Helvetica").text(new Date().toLocaleString("en-IN"), 190, 172);

    doc.moveTo(60, 197).lineTo(535, 197).stroke("#bbb");

    let y = 215;
    const writeRow = (label, value) => {
      doc.font("Helvetica-Bold").fillColor("#000").text(label, 60, y);
      doc.font("Helvetica").fillColor("#111").text(String(value ?? ""), 190, y, { width: 340 });
      y += 24;
    };

    writeRow("Student Name:", record.studentId?.name || "N/A");
    writeRow("Student Email:", record.studentId?.email || "N/A");
    writeRow("Course:", record.courseId?.title || "General Fee");
    writeRow("Fee Title:", record.title || "Coaching Fee");
    writeRow("Installment:", `${record.installmentNumber || 1}/${record.totalInstallments || 1}`);
    writeRow("Payment Date:", payment.paidAt ? new Date(payment.paidAt).toLocaleString("en-IN") : "N/A");
    writeRow("Payment Mode:", String(payment.paymentMode || "cash").toUpperCase());
    writeRow("Reference ID:", payment.referenceId || payment.razorpayPaymentId || "-");
    writeRow("Amount Paid:", `Rs ${round2(payment.amount).toLocaleString("en-IN")}`);
    writeRow("Total Fee:", `Rs ${round2(record.finalFee).toLocaleString("en-IN")}`);
    writeRow("Total Paid:", `Rs ${round2(record.amountPaid).toLocaleString("en-IN")}`);
    writeRow("Remaining Due:", `Rs ${round2(record.dueAmount).toLocaleString("en-IN")}`);
    writeRow("Status:", String(normalizeRecord(record).status).toUpperCase());

    doc.moveDown(1.5);
    doc.fontSize(10).fillColor("#555").font("Helvetica").text(
      "This is a system-generated receipt and does not require a physical signature.",
      60,
      y + 12,
      { width: 475, align: "center" }
    );

    doc.end();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate fee receipt",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
