import express from "express"
import { createOrder, verifyPayment } from "../controllers/orderController.js";
import { generateReceipt, getMyReceipts } from "../controllers/receiptController.js";
import isAuth from "../middlewares/isAuth.js";
import { paymentLimiter } from "../middlewares/security.js";
import { validatePayment, validatePaymentVerification, validateMongoId } from "../middlewares/inputValidation.js";


let paymentRouter = express.Router()

// Apply rate limiting (validation temporarily disabled for debugging)
paymentRouter.post("/create-order", paymentLimiter, createOrder);
paymentRouter.post("/verify-payment", paymentLimiter, verifyPayment);
paymentRouter.get("/receipt/generate/:orderId", isAuth, paymentLimiter, generateReceipt);
paymentRouter.get("/receipt/my-receipts", isAuth, paymentLimiter, getMyReceipts);


export default paymentRouter