
import mongoose from "mongoose";

const pincodeSchema = new mongoose.Schema(
  {
    postal_code: {
      type: String,
      required: true,
      trim: true,
      match: /^[1-9][0-9]{5}$/,
    },

    city_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
    },

    state_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "State",
      required: true,
    },

    country_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      required: true,
    },

    post_offices: [
      {
        type: String,
        trim: true,
      },
    ],

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "pincodes",
  }
);

pincodeSchema.index(
  { postal_code: 1 },
  {
    unique: true,
    name: "unique_postal_code",
  }
);

pincodeSchema.index({
  city_id: 1,
  is_active: 1,
});

const Pincode = mongoose.model("Pincode", pincodeSchema);

export default Pincode;
