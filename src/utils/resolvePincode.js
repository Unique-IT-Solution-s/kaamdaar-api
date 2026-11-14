import mongoose from "mongoose";
import axios from "axios";

import Country from "../models/Country.js";
import State from "../models/State.js";
import City from "../models/City.js";
import Pincode from "../models/Pincode.js";

const COUNTRY_CODES = {
  india: "IN",
};

export const resolvePincode = async (postalCode) => {
  // STEP 1: Check MongoDB cache
  const existingPincode = await Pincode.findOne({
    postal_code: postalCode,
    is_active: true,
  })
    .populate("city_id", "city_name state_id country_id is_active")
    .populate("state_id", "state_name country_id is_active")
    .populate("country_id", "country_name country_code is_active")
    .lean();

  // STEP 2: Return existing mapping if valid
  if (
    existingPincode?.city_id?.is_active &&
    existingPincode?.state_id?.is_active &&
    existingPincode?.country_id?.is_active
  ) {
    const city = existingPincode.city_id;
    const state = existingPincode.state_id;
    const country = existingPincode.country_id;

    const isConsistent =
      city.state_id?.toString() === state._id.toString() &&
      city.country_id?.toString() === country._id.toString() &&
      state.country_id?.toString() === country._id.toString();

    if (isConsistent) {
      return {
        pincode: existingPincode,
        city,
        state,
        country,
        source: "DATABASE",
      };
    }
  }

  // STEP 3: Fetch PIN-code information from external API
  let response;

  try {
    response = await axios.get(
      `https://api.postalpincode.in/pincode/${postalCode}`,
      { timeout: 10000 },
    );
  } catch (error) {
    const serviceError = new Error(
      "Postal service is currently unavailable. Please try again.",
    );
    serviceError.statusCode = 502;
    throw serviceError;
  }

  const apiResult = response.data?.[0];

  if (
    !apiResult ||
    apiResult.Status !== "Success" ||
    !Array.isArray(apiResult.PostOffice) ||
    apiResult.PostOffice.length === 0
  ) {
    const error = new Error("No location found for this PIN code.");
    error.statusCode = 404;
    throw error;
  }

  // STEP 4: Extract location details
  const postOffices = apiResult.PostOffice;
  const firstOffice = postOffices[0];

  const countryName = firstOffice.Country?.trim();
  const stateName = firstOffice.State?.trim();
  const districtName = firstOffice.District?.trim();

  if (!countryName || !stateName || !districtName) {
    const error = new Error(
      "External postal service returned incomplete location data.",
    );
    error.statusCode = 502;
    throw error;
  }

  // STEP 5: Verify all post offices have the same location
  const sameLocation = postOffices.every((office) => {
    return (
      office.Country?.trim().toLowerCase() === countryName.toLowerCase() &&
      office.State?.trim().toLowerCase() === stateName.toLowerCase() &&
      office.District?.trim().toLowerCase() === districtName.toLowerCase()
    );
  });

  if (!sameLocation) {
    const error = new Error(
      "This PIN code has multiple district mappings. Manual location mapping is required.",
    );
    error.statusCode = 409;
    throw error;
  }

  // STEP 6: Validate country
  const countryCode = COUNTRY_CODES[countryName.toLowerCase()];

  if (!countryCode) {
    const error = new Error(
      "This PIN code belongs to an unsupported country.",
    );
    error.statusCode = 400;
    throw error;
  }

  // STEP 7: Extract post-office names
  const officeNames = [
    ...new Set(
      postOffices
        .map((office) => office.Name?.trim())
        .filter(Boolean),
    ),
  ];

  // STEP 8: Create or reuse location records
  const session = await mongoose.startSession();

  let savedLocation;

  try {
    await session.withTransaction(async () => {
      // COUNTRY
      const country = await Country.findOneAndUpdate(
        { country_code: countryCode },
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
        },
      );

      // STATE
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
        },
      );

      // CITY (District is used as City in Kaamdaar)
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
        },
      );

      // PINCODE
      const pincode = await Pincode.findOneAndUpdate(
        { postal_code: postalCode },
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
        },
      );

      savedLocation = {
        pincode,
        city,
        state,
        country,
        source: "EXTERNAL_API",
      };
    });
  } finally {
    await session.endSession();
  }

  return savedLocation;
};