import express from "express";
import upload from "../middlewares/multer.js";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import {
  getMarketingContent,
  getAdminMarketingContent,
  updateMarketingContent,
  addGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  createDemoBooking,
  getDemoBookings,
  updateDemoBookingStatus,
} from "../controllers/marketingController.js";

const marketingRoute = express.Router();

marketingRoute.get("/public", getMarketingContent);
marketingRoute.post("/demo-booking", createDemoBooking);

marketingRoute.get("/admin/content", isAuth, isAdmin, getAdminMarketingContent);
marketingRoute.put("/admin/content", isAuth, isAdmin, upload.single("offerImage"), updateMarketingContent);
marketingRoute.post("/admin/gallery", isAuth, isAdmin, upload.single("image"), addGalleryItem);
marketingRoute.patch("/admin/gallery/:itemId", isAuth, isAdmin, updateGalleryItem);
marketingRoute.delete("/admin/gallery/:itemId", isAuth, isAdmin, deleteGalleryItem);
marketingRoute.get("/admin/demo-bookings", isAuth, isAdmin, getDemoBookings);
marketingRoute.patch("/admin/demo-bookings/:bookingId/status", isAuth, isAdmin, updateDemoBookingStatus);

export default marketingRoute;
