import mongoose from "mongoose";

/* =========================================
   1. SEARCH ROUND CONFIGURATION
========================================= */

const ROUND_RADIUS_MAP = {
  1: 3000,
  2: 5000,
  3: 7000,
  4: 10000,
  5: 15000, 
};

/* =========================================
   2. BOOKING OFFER MAIN SCHEMA
========================================= */

const bookingOfferSchema = new mongoose.Schema(
  {
    // -------------------------------------
    // A. BOOKING AND PROVIDER
    // -------------------------------------

    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      immutable: true,
    },

    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    // -------------------------------------
    // B. SEARCH ROUND INFORMATION
    // -------------------------------------

    offer_round: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    search_radius_meters: {
      type: Number,
      required: true,
      enum: [3000, 5000, 7000, 10000, 15000],
    },

    distance_meters: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: "Distance must be a valid number.",
      },
    },

    // -------------------------------------
    // C. PROVIDER LOCATION SOURCE
    // -------------------------------------

    location_source: {
      type: String,
      enum: ["LIVE", "SERVICE_LOCATION"],
      required: true,
    },

    provider_location_updated_at: {
      type: Date,
      default: null,
    },

    // -------------------------------------
    // D. OFFER STATUS
    // -------------------------------------

    offer_status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
      default: "PENDING",
      required: true,
    },

    // -------------------------------------
    // E. OFFER TIMING
    // -------------------------------------

    offered_at: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },

    expires_at: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value > this.offered_at;
        },
        message: "Offer expiry must be after offer creation time.",
      },
    },

    responded_at: {
      type: Date,
      default: null,
    },

    // -------------------------------------
    // F. PROVIDER RESPONSE
    // -------------------------------------

    rejection_reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    cancellation_reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // -------------------------------------
    // G. ADMIN / SYSTEM TRACKING
    // -------------------------------------

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "booking_offers",
  },
);

/* =========================================
   3. CUSTOM VALIDATION
========================================= */

// Ensure each round uses its correct search radius.
bookingOfferSchema.pre("validate", function () {
  const expectedRadius = ROUND_RADIUS_MAP[this.offer_round];

  if (expectedRadius && this.search_radius_meters !== expectedRadius) {
    this.invalidate(
      "search_radius_meters",
      `Round ${this.offer_round} must use a radius of ${expectedRadius} meters.`,
    );
  }

  // A live location must have its update timestamp.
  if (this.location_source === "LIVE" && !this.provider_location_updated_at) {
    this.invalidate(
      "provider_location_updated_at",
      "Live location update timestamp is required.",
    );
  }
});

/* =========================================
   4. INDEXES
========================================= */

// Prevent the same provider receiving
// the same booking offer more than once.
bookingOfferSchema.index(
  {
    booking_id: 1,
    provider_id: 1,
  },
  {
    unique: true,
    name: "unique_booking_provider_offer",
  },
);

// Find all offers belonging to a booking.
bookingOfferSchema.index({
  booking_id: 1,
  offer_status: 1,
});

// Find provider's pending offers.
bookingOfferSchema.index({
  provider_id: 1,
  offer_status: 1,
  expires_at: 1,
});

// Find expired pending offers.
bookingOfferSchema.index({
  offer_status: 1,
  expires_at: 1,
});

// Find offers by search round.
bookingOfferSchema.index({
  booking_id: 1,
  offer_round: 1,
});

/* =========================================
   5. EXPORT MODEL
========================================= */

const BookingOffer =
  mongoose.models.BookingOffer ||
  mongoose.model("BookingOffer", bookingOfferSchema);

export default BookingOffer;
