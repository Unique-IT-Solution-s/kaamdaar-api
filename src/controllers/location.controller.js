
import mongoose from "mongoose";
import axios from "axios";

import Country from "../models/Country.js";
import State from "../models/State.js";
import City from "../models/City.js";
import Pincode from "../models/Pincode.js";

// India country code mapping
const COUNTRY_CODES = {
  india: "IN",
};

// Format the response consistently
const formatLocationResponse = (pincode, city, state, country, source) => ({
  success: true,
  message: "Location fetched successfully.",
  source,
  data: {
    postal_code: pincode.postal_code,

    city: {
      city_id: city._id,
      city_name: city.city_name,
    },

    state: {
      state_id: state._id,
      state_name: state.state_name,
    },

    country: {
      country_id: country._id,
      country_name: country.country_name,
      country_code: country.country_code,
    },

    post_offices: pincode.post_offices,
  },
});

export const getLocationByPincode = async (req, res) => {
  try {
    // STEP 1: Get PIN code from URL
    const { postalCode } = req.params;

    // STEP 2: Validate PIN code
    if (!/^[1-9][0-9]{5}$/.test(postalCode)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 6-digit Indian PIN code.",
      });
    }

    // STEP 3: Check MongoDB cache first
    const existingPincode = await Pincode.findOne({
      postal_code: postalCode,
      is_active: true,
    })
      .populate("city_id", "city_name")
      .populate("state_id", "state_name")
      .populate("country_id", "country_name country_code")
      .lean();

    // If all referenced records exist, return cached data
    if (
      existingPincode &&
      existingPincode.city_id &&
      existingPincode.state_id &&
      existingPincode.country_id
    ) {
      return res.status(200).json({
        ...formatLocationResponse(
          existingPincode,
          existingPincode.city_id,
          existingPincode.state_id,
          existingPincode.country_id,
          "DATABASE"
        ),
      });
    }

    // STEP 4: Call external PIN-code API
    const response = await axios.get(
      `https://api.postalpincode.in/pincode/${postalCode}`,
      {
        timeout: 10000,
      }
    );

    const apiResult = response.data?.[0];

    if (
      !apiResult ||
      apiResult.Status !== "Success" ||
      !Array.isArray(apiResult.PostOffice) ||
      apiResult.PostOffice.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: "No location found for this PIN code.",
      });
    }

    const postOffices = apiResult.PostOffice;

    // STEP 5: Extract location information
    const firstOffice = postOffices[0];

    const countryName = firstOffice.Country?.trim();
    const stateName = firstOffice.State?.trim();
    const districtName = firstOffice.District?.trim();

    if (!countryName || !stateName || !districtName) {
      return res.status(502).json({
        success: false,
        message: "External postal service returned incomplete location data.",
      });
    }

    // STEP 6: Verify all returned post offices
    // have the same country, state and district
    const sameLocation = postOffices.every((office) => {
      return (
        office.Country?.trim().toLowerCase() === countryName.toLowerCase() &&
        office.State?.trim().toLowerCase() === stateName.toLowerCase() &&
        office.District?.trim().toLowerCase() === districtName.toLowerCase()
      );
    });

    if (!sameLocation) {
      return res.status(409).json({
        success: false,
        message:
          "This PIN code has multiple district mappings. Manual location mapping is required.",
      });
    }

    // STEP 7: Validate supported country
    const countryCode = COUNTRY_CODES[countryName.toLowerCase()];

    if (!countryCode) {
      return res.status(400).json({
        success: false,
        message: "This PIN code belongs to an unsupported country.",
      });
    }

    // STEP 8: Extract post-office names
    const officeNames = [
      ...new Set(
        postOffices
          .map((office) => office.Name?.trim())
          .filter(Boolean)
      ),
    ];

    // STEP 9: Save/reuse location records atomically
    const session = await mongoose.startSession();

    let savedLocation;

    try {
      await session.withTransaction(async () => {
        // COUNTRY: Find or create
        const country = await Country.findOneAndUpdate(
          {
            country_code: countryCode,
          },
          {
            $setOnInsert: {
              country_name: countryName,
              country_code: countryCode,
            },
            $set: {
              is_active: true,
            },
          },
          {
            upsert: true,
            returnDocument : 'after',
            session,
          }
        );

        // STATE: Find or create
        const state = await State.findOneAndUpdate(
          {
            country_id: country._id,
            state_name: stateName,
          },
          {
            $setOnInsert: {
              country_id: country._id,
              state_name: stateName,
            },
            $set: {
              is_active: true,
            },
          },
          {
            upsert: true,
            returnDocument : 'after',
            session,
          }
        );

        // CITY: District is used as City for Kaamdaar
        const city = await City.findOneAndUpdate(
          {
            state_id: state._id,
            city_name: districtName,
          },
          {
            $setOnInsert: {
              city_name: districtName,
              state_id: state._id,
              country_id: country._id,
              latitude: null,
              longitude: null,
            },
            $set: {
              is_active: true,
            },
          },
          {
            upsert: true,
            returnDocument : 'after',
            session,
          }
        );

        // PINCODE: Find or create mapping
        const pincode = await Pincode.findOneAndUpdate(
          {
            postal_code: postalCode,
          },
          {
            $set: {
              city_id: city._id,
              state_id: state._id,
              country_id: country._id,
              post_offices: officeNames,
              is_active: true,
            },
          },
          {
            upsert: true,
            returnDocument : 'after',
            session,
          }
        );

        savedLocation = {
          pincode,
          city,
          state,
          country,
        };
      });
    } finally {
      await session.endSession();
    }

    // STEP 10: Return response
    return res.status(200).json(
      formatLocationResponse(
        savedLocation.pincode,
        savedLocation.city,
        savedLocation.state,
        savedLocation.country,
        "EXTERNAL_API"
      )
    );

  } catch (error) {
    console.error("Get location by PIN code error:", error.message);

    if (
      error.code === 11000
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Location data was created by another request. Please retry the PIN code lookup.",
      });
    }

    if (error.response || error.code === "ECONNABORTED") {
      return res.status(502).json({
        success: false,
        message: "Postal service is currently unavailable. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch location details.",
    });
  }
};
