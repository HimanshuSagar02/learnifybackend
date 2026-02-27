import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    ctaLabel: { type: String, default: "Book Demo Class" },
    ctaLink: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const galleryItemSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    caption: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

const teamMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    profileLink: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "", trim: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const aboutProjectSchema = new mongoose.Schema(
  {
    badgeTitle: { type: String, default: "About Project", trim: true },
    headline: { type: String, default: "", trim: true },
    subheadline: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    highlights: { type: [String], default: [] },
    imageUrl: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const marketingContentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "main",
      trim: true,
    },
    currentOffer: {
      type: offerSchema,
      default: () => ({
        title: "",
        description: "",
        imageUrl: "",
        ctaLabel: "Book Demo Class",
        ctaLink: "",
        expiresAt: null,
        isActive: true,
      }),
    },
    gallery: {
      type: [galleryItemSchema],
      default: [],
    },
    teamMembers: {
      type: [teamMemberSchema],
      default: [],
    },
    aboutProject: {
      type: aboutProjectSchema,
      default: () => ({
        badgeTitle: "About Project",
        headline: "",
        subheadline: "",
        description: "",
        highlights: [],
        imageUrl: "",
        isActive: true,
      }),
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const MarketingContent = mongoose.model("MarketingContent", marketingContentSchema);

export default MarketingContent;
