import mongoose from "mongoose";

const stateSchema = new mongoose.Schema({
    state_name: {
      type: String,
      required: true,
      trim: true,
    },

    country_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      required: true,
    },

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
    collection: "states",
})

stateSchema.index({country_id : 1, state_name : 1}, {unique : true})

const State = mongoose.model("State", stateSchema)

export default State