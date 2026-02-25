import mongoose from "mongoose";
import validator from "validator";
import uploadOnCloudinary from "../configs/cloudinary.js";
import MarketingContent from "../models/marketingContentModel.js";
import DemoBooking from "../models/demoBookingModel.js";
import User from "../models/userModel.js";

const DEFAULT_CONTENT_KEY = "main";
const ALLOWED_BOOKING_STATUSES = new Set([
  "pending",
  "contacted",
  "scheduled",
  "completed",
  "cancelled",
]);

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
};

const defaultMarketingPayload = () => ({
  currentOffer: {
    title: "",
    description: "",
    imageUrl: "",
    ctaLabel: "Book Demo Class",
    ctaLink: "",
    expiresAt: null,
    isActive: true,
  },
  gallery: [],
});

const normalizeMarketingPayload = (doc) => {
  if (!doc) return defaultMarketingPayload();

  const source = doc.toObject ? doc.toObject() : doc;
  return {
    currentOffer: {
      title: source.currentOffer?.title || "",
      description: source.currentOffer?.description || "",
      imageUrl: source.currentOffer?.imageUrl || "",
      ctaLabel: source.currentOffer?.ctaLabel || "Book Demo Class",
      ctaLink: source.currentOffer?.ctaLink || "",
      expiresAt: source.currentOffer?.expiresAt || null,
      isActive: source.currentOffer?.isActive !== false,
    },
    gallery: Array.isArray(source.gallery)
      ? source.gallery.map((item) => ({
          _id: item._id,
          imageUrl: item.imageUrl || "",
          caption: item.caption || "",
          createdAt: item.createdAt || null,
        }))
      : [],
    updatedAt: source.updatedAt || null,
    updatedBy: source.updatedBy || null,
  };
};

const getOrCreateMarketingContent = async () => {
  let content = await MarketingContent.findOne({ key: DEFAULT_CONTENT_KEY });
  if (!content) {
    content = await MarketingContent.create({
      key: DEFAULT_CONTENT_KEY,
      ...defaultMarketingPayload(),
    });
  }
  return content;
};

export const getMarketingContent = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(200).json(defaultMarketingPayload());
    }

    const content = await MarketingContent.findOne({ key: DEFAULT_CONTENT_KEY }).lean();
    return res.status(200).json(normalizeMarketingPayload(content));
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch marketing content",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getAdminMarketingContent = async (req, res) => {
  try {
    const content = await getOrCreateMarketingContent();
    return res.status(200).json(normalizeMarketingPayload(content));
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch marketing content",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateMarketingContent = async (req, res) => {
  try {
    const content = await getOrCreateMarketingContent();
    const { title, description, ctaLabel, ctaLink, expiresAt, isActive, clearOfferImage } =
      req.body || {};

    if (title !== undefined) content.currentOffer.title = String(title).trim();
    if (description !== undefined) content.currentOffer.description = String(description).trim();
    if (ctaLabel !== undefined) content.currentOffer.ctaLabel = String(ctaLabel).trim();
    if (ctaLink !== undefined) content.currentOffer.ctaLink = String(ctaLink).trim();
    if (expiresAt !== undefined) {
      content.currentOffer.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }
    if (isActive !== undefined) {
      content.currentOffer.isActive = parseBoolean(isActive, true);
    }
    if (parseBoolean(clearOfferImage, false)) {
      content.currentOffer.imageUrl = "";
    }

    if (req.file?.path) {
      const uploadedUrl = await uploadOnCloudinary(req.file.path);
      if (!uploadedUrl) {
        return res.status(400).json({ message: "Offer image upload failed" });
      }
      content.currentOffer.imageUrl = uploadedUrl;
    }

    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(200).json({
      message: "Marketing offer updated successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update marketing content",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const addGalleryItem = async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ message: "Gallery image is required" });
    }

    const content = await getOrCreateMarketingContent();
    const uploadedUrl = await uploadOnCloudinary(req.file.path);
    if (!uploadedUrl) {
      return res.status(400).json({ message: "Gallery image upload failed" });
    }

    if (content.gallery.length >= 30) {
      return res.status(400).json({ message: "Maximum 30 gallery images are allowed" });
    }

    content.gallery.push({
      imageUrl: uploadedUrl,
      caption: String(req.body?.caption || "").trim(),
    });
    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(201).json({
      message: "Gallery image added successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to add gallery image",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateGalleryItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "Invalid gallery item id" });
    }

    const content = await getOrCreateMarketingContent();
    const item = content.gallery.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Gallery item not found" });
    }

    if (req.body?.caption !== undefined) {
      item.caption = String(req.body.caption || "").trim();
    }

    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(200).json({
      message: "Gallery item updated successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update gallery item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const deleteGalleryItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: "Invalid gallery item id" });
    }

    const content = await getOrCreateMarketingContent();
    const item = content.gallery.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Gallery item not found" });
    }

    item.deleteOne();
    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(200).json({
      message: "Gallery image removed successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete gallery item",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const createDemoBooking = async (req, res) => {
  try {
    const { name, email, phone, className, message, preferredDate } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!phone || String(phone).trim().length < 8) {
      return res.status(400).json({ message: "Valid phone number is required" });
    }

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    if (normalizedEmail && !validator.isEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Please enter a valid email" });
    }

    const hasValidUserId = req.userId && mongoose.Types.ObjectId.isValid(req.userId);
    const user = hasValidUserId ? await User.findById(req.userId).select("email class").lean() : null;

    const booking = await DemoBooking.create({
      name: String(name).trim(),
      email: normalizedEmail || user?.email || "",
      phone: String(phone).trim(),
      className: String(className || user?.class || "").trim(),
      message: String(message || "").trim(),
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      user: hasValidUserId ? req.userId : null,
    });

    return res.status(201).json({
      message: "Demo class booking submitted successfully",
      booking: {
        _id: booking._id,
        status: booking.status,
        createdAt: booking.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create demo booking",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getDemoBookings = async (req, res) => {
  try {
    const { status } = req.query || {};
    const filter = {};
    if (status && ALLOWED_BOOKING_STATUSES.has(String(status))) {
      filter.status = String(status);
    }

    const bookings = await DemoBooking.find(filter)
      .populate("user", "name email role class")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json(bookings || []);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch demo bookings",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateDemoBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking id" });
    }
    if (!ALLOWED_BOOKING_STATUSES.has(String(status))) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    const booking = await DemoBooking.findByIdAndUpdate(
      bookingId,
      { $set: { status: String(status) } },
      { new: true }
    ).lean();

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.status(200).json({
      message: "Booking status updated successfully",
      booking,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update booking status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
