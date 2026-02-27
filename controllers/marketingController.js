import mongoose from "mongoose";
import validator from "validator";
import uploadOnCloudinary, { getLastCloudinaryError } from "../configs/cloudinary.js";
import connectDb from "../configs/db.js";
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

const ALLOWED_PROFILE_DOMAINS = [
  "linkedin.com",
  "github.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
  "youtube.com",
];

const isAllowedProfileLink = (value) => {
  if (!validator.isURL(value, { require_protocol: true })) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ALLOWED_PROFILE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};

const normalizeTeamMemberInput = (payload = {}, { requireName = false } = {}) => {
  const name = String(payload.name || "").trim();
  const role = String(payload.role || "").trim();
  const description = String(payload.description || "").trim();
  const profileLink = String(payload.profileLink || "").trim();
  const imageUrlFromPayload = String(payload.imageUrl || "").trim();
  const displayOrder = Number.isFinite(Number(payload.displayOrder))
    ? Number(payload.displayOrder)
    : 0;
  const isActive = parseBoolean(payload.isActive, true);

  if (requireName && !name) {
    throw new Error("Team member name is required");
  }
  if (profileLink && !isAllowedProfileLink(profileLink)) {
    throw new Error(
      "Profile link must be a valid LinkedIn/GitHub/X/Instagram/Facebook/YouTube URL"
    );
  }
  if (imageUrlFromPayload) {
    throw new Error("Team photo URL is not allowed. Please upload photo file.");
  }

  return {
    name,
    role,
    description,
    profileLink,
    imageUrl: "",
    displayOrder,
    isActive,
  };
};

const normalizeAboutProjectInput = (payload = {}) => {
  const badgeTitle = String(payload.badgeTitle || "About Project").trim();
  const headline = String(payload.headline || "").trim();
  const subheadline = String(payload.subheadline || "").trim();
  const description = String(payload.description || "").trim();
  const imageUrl = String(payload.imageUrl || "").trim();
  const isActive = parseBoolean(payload.isActive, true);

  const rawHighlights = Array.isArray(payload.highlights)
    ? payload.highlights
    : String(payload.highlights || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);

  if (imageUrl && !validator.isURL(imageUrl, { require_protocol: true })) {
    throw new Error("About image URL must be a valid URL with http/https");
  }

  return {
    badgeTitle,
    headline,
    subheadline,
    description,
    highlights: rawHighlights.slice(0, 8),
    imageUrl,
    isActive,
  };
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
  teamMembers: [],
  aboutProject: {
    badgeTitle: "About Project",
    headline: "We Help You Build Technical Mastery",
    subheadline: "A practical learning platform for developers and engineers",
    description:
      "We provide a modern technical learning platform focused on practical skills, project execution, and mentor-guided growth.",
    highlights: [
      "Project-Based Learning",
      "Industry Mentors",
      "Career-Focused Paths",
      "Lifetime Access",
    ],
    imageUrl: "",
    isActive: true,
  },
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
    teamMembers: Array.isArray(source.teamMembers)
      ? source.teamMembers
          .map((member) => ({
            _id: member._id,
            name: member.name || "",
            role: member.role || "",
            description: member.description || "",
            profileLink: member.profileLink || "",
            imageUrl: member.imageUrl || "",
            displayOrder: Number.isFinite(Number(member.displayOrder))
              ? Number(member.displayOrder)
              : 0,
            isActive: member.isActive !== false,
            createdAt: member.createdAt || null,
            updatedAt: member.updatedAt || null,
          }))
          .sort((a, b) => a.displayOrder - b.displayOrder)
      : [],
    aboutProject: {
      badgeTitle: source.aboutProject?.badgeTitle || "About Project",
      headline: source.aboutProject?.headline || "",
      subheadline: source.aboutProject?.subheadline || "",
      description: source.aboutProject?.description || "",
      highlights: Array.isArray(source.aboutProject?.highlights)
        ? source.aboutProject.highlights.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      imageUrl: source.aboutProject?.imageUrl || "",
      isActive: source.aboutProject?.isActive !== false,
    },
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
      try {
        await connectDb();
      } catch (dbError) {
        return res.status(503).json({
          message: "Marketing service temporarily unavailable",
          error: process.env.NODE_ENV === "development" ? dbError.message : undefined,
        });
      }
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: "Marketing service temporarily unavailable",
      });
    }

    const content = await getOrCreateMarketingContent();
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
        const reason = getLastCloudinaryError() || "Unknown image upload error";
        return res.status(400).json({
          message: "Offer image upload failed",
          error: reason,
          hint: "Check Cloudinary credentials/config on server and retry",
        });
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
      const reason = getLastCloudinaryError() || "Unknown image upload error";
      return res.status(400).json({
        message: "Gallery image upload failed",
        error: reason,
        hint: "Check Cloudinary credentials/config on server and retry",
      });
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

export const addTeamMember = async (req, res) => {
  try {
    const content = await getOrCreateMarketingContent();
    if (content.teamMembers.length >= 40) {
      return res.status(400).json({ message: "Maximum 40 team members are allowed" });
    }

    let memberPayload;
    try {
      memberPayload = normalizeTeamMemberInput(req.body || {}, { requireName: true });
    } catch (error) {
      return res.status(400).json({ message: error.message || "Invalid team member data" });
    }

    if (req.file?.path) {
      const uploadedUrl = await uploadOnCloudinary(req.file.path);
      if (!uploadedUrl) {
        return res.status(400).json({ message: "Team photo upload failed" });
      }
      memberPayload.imageUrl = uploadedUrl;
    }

    content.teamMembers.push(memberPayload);
    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(201).json({
      message: "Team member added successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to add team member",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateTeamMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: "Invalid team member id" });
    }

    const content = await getOrCreateMarketingContent();
    const member = content.teamMembers.id(memberId);
    if (!member) {
      return res.status(404).json({ message: "Team member not found" });
    }

    const source = req.body || {};
    if (source.name !== undefined && !String(source.name || "").trim()) {
      return res.status(400).json({ message: "Team member name is required" });
    }
    if (source.imageUrl !== undefined && String(source.imageUrl || "").trim()) {
      return res.status(400).json({
        message: "Team photo URL is not allowed. Please upload photo file.",
      });
    }

    if (source.profileLink !== undefined) {
      const profileLink = String(source.profileLink || "").trim();
      if (profileLink && !isAllowedProfileLink(profileLink)) {
        return res.status(400).json({
          message:
            "Profile link must be a valid LinkedIn/GitHub/X/Instagram/Facebook/YouTube URL",
        });
      }
      member.profileLink = profileLink;
    }

    if (req.file?.path) {
      const uploadedUrl = await uploadOnCloudinary(req.file.path);
      if (!uploadedUrl) {
        return res.status(400).json({ message: "Team photo upload failed" });
      }
      member.imageUrl = uploadedUrl;
    }

    if (source.name !== undefined) member.name = String(source.name || "").trim();
    if (source.role !== undefined) member.role = String(source.role || "").trim();
    if (source.description !== undefined) member.description = String(source.description || "").trim();
    if (source.displayOrder !== undefined) {
      member.displayOrder = Number.isFinite(Number(source.displayOrder))
        ? Number(source.displayOrder)
        : 0;
    }
    if (source.isActive !== undefined) {
      member.isActive = parseBoolean(source.isActive, true);
    }

    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(200).json({
      message: "Team member updated successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update team member",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const deleteTeamMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: "Invalid team member id" });
    }

    const content = await getOrCreateMarketingContent();
    const member = content.teamMembers.id(memberId);
    if (!member) {
      return res.status(404).json({ message: "Team member not found" });
    }

    member.deleteOne();
    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(200).json({
      message: "Team member removed successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete team member",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateAboutProject = async (req, res) => {
  try {
    const content = await getOrCreateMarketingContent();
    let payload;

    try {
      payload = normalizeAboutProjectInput(req.body || {});
    } catch (error) {
      return res.status(400).json({ message: error.message || "Invalid about project data" });
    }

    content.aboutProject = payload;
    content.updatedBy = req.userId || null;
    await content.save();

    return res.status(200).json({
      message: "About project updated successfully",
      content: normalizeMarketingPayload(content),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update about project",
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
