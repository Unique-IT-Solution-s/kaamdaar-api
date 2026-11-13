import mongoose from "mongoose";

const bookingOfferSchema = new mongoose.Schema(
  {
    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },

    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // -------------------------------------
    // C. SEARCH ROUND INFORMATION
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
    },


    // -------------------------------------
    // D. PROVIDER LOCATION SOURCE
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
    // E. OFFER STATUS
    // -------------------------------------

    offer_status: {
      type: String,
      enum: [
        "PENDING",
        "ACCEPTED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
      ],
      default: "PENDING",
      required: true,
    },


    // -------------------------------------
    // F. OFFER TIMING
    // -------------------------------------

    offered_at: {
      type: Date,
      required: true,
      default: Date.now,
    },

    expires_at: {
      type: Date,
      required: true,
    },

    responded_at: {
      type: Date,
      default: null,
    },


    // -------------------------------------
    // G. PROVIDER RESPONSE
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
    // H. ADMIN / SYSTEM TRACKING
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
  }
);


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
  }
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
   3. EXPORT MODEL
========================================= */

const BookingOffer =
  mongoose.models.BookingOffer ||
  mongoose.model("BookingOffer", bookingOfferSchema);

export default BookingOffer;
