import mongoose from "mongoose";

/* =========================================
   CATEGORY IMAGE SCHEMA
========================================= */

const categoryImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: null,
    },

    public_id: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    _id: false,
  },
);

/* =========================================
   CATEGORY MAIN SCHEMA
========================================= */

const categorySchema = new mongoose.Schema(
  {
    category_name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    // -------------------------------------
    // B. CATEGORY IMAGE
    // -------------------------------------

    image: {
      type: categoryImageSchema,
      default: () => ({}),
    },

    // -------------------------------------
    // C. FRONTEND DISPLAY
    // -------------------------------------

    icon: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    is_featured: {
      type: Boolean,
      default: false,
    },

    sort_order: {
      type: Number,
      default: 0,
      min: 0,
      max: 10000,
    },

    // -------------------------------------
    // D. ADMIN TRACKING
    // -------------------------------------

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // commission_percentage
    commission_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 10,
      validate: {
        validator: Number.isFinite,
        message: "Commission percentage must be a valid number.",
      },
    },
  },

  {
    timestamps: true,
    collection: "categories",
  },
);

/* =========================================
   INDEXES
========================================= */

// Unique category slug.
categorySchema.index(
  { slug: 1 },
  {
    unique: true,
    name: "unique_category_slug",
  },
);

// Fetch active categories in display order.
categorySchema.index(
  { is_active: 1, sort_order: 1 },
  {
    name: "active_categories_sort_order",
  },
);

// Fetch featured active categories.
categorySchema.index(
  { is_featured: 1, is_active: 1 },
  {
    name: "featured_categories",
  },
);

const Category =
  mongoose.models.Category || mongoose.model("Category", categorySchema);

export default Category;
