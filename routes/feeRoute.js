import express from "express";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import {
  addFeePaymentByAdmin,
  createFeePlan,
  createOnlineFeeOrder,
  generateFeeReceipt,
  getAdminFeeRecords,
  getMyFeeRecords,
  verifyOnlineFeePayment,
} from "../controllers/feeController.js";

const feeRoute = express.Router();

feeRoute.get("/admin", isAuth, isAdmin, getAdminFeeRecords);
feeRoute.post("/admin", isAuth, isAdmin, createFeePlan);
feeRoute.post("/admin/:recordId/pay", isAuth, isAdmin, addFeePaymentByAdmin);

feeRoute.get("/my", isAuth, getMyFeeRecords);
feeRoute.post("/:recordId/create-online-order", isAuth, createOnlineFeeOrder);
feeRoute.post("/:recordId/verify-online-payment", isAuth, verifyOnlineFeePayment);
feeRoute.get("/:recordId/receipt/:paymentId", isAuth, generateFeeReceipt);

export default feeRoute;
