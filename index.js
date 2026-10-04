import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import {
  fromNodeHeaders,
  toNodeHandler,
} from "better-auth/node";

import { auth } from "./auth/auth.js";
import {
  facilitiesCollection,
  bookingsCollection,
  connectToDatabase,
} from "./config/database.js";

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  "https://sportnest-client-seven.vercel.app",
  "https://sportnest-client-git-main-saklainmostak-learners-projects.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(
          new Error(
            "CORS not allowed",
          ),
        );
      }
    },

    credentials: true,

    exposedHeaders: [
      "set-auth-token",
    ],
  }),
);

// Better Auth handler must be registered before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const cookieToken = req.cookies?.token;
  const headerToken = req.headers.authorization?.split(" ")[1];

  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).send({
      message: "Unauthorized access",
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    (error, decoded) => {
      if (error) {
        return res.status(403).send({
          message: "Forbidden access",
        });
      }

      req.user = decoded;
      next();
    },
  );
};

const isValidObjectId = (id) => ObjectId.isValid(id);

const normalizeSlots = (slots) => {
  if (Array.isArray(slots)) {
    return slots
      .map((slot) => String(slot).trim())
      .filter(Boolean);
  }

  if (typeof slots === "string") {
    return slots
      .split(",")
      .map((slot) => slot.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeFacilityDocument = (facility) => {
  if (!facility) return facility;

  return {
    ...facility,
    pricePerHour: Number(
      facility.pricePerHour ?? facility.price ?? 0,
    ),
    availableSlots: Array.isArray(
      facility.availableSlots,
    )
      ? facility.availableSlots
      : normalizeSlots(facility.slots),
  };
};

// =======================
// JWT
// =======================

app.post("/jwt", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).send({
        message: "Unauthorized access",
      });
    }

    const token = jwt.sign(
      {
        id: session.user.id,
        email: session.user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production",
        sameSite:
          process.env.NODE_ENV === "production"
            ? "none"
            : "lax",
      })
      .send({
        success: true,
      });
  } catch (error) {
    console.error("JWT error:", error);

    res.status(500).send({
      message: "Failed to create access token",
      error: error.message,
    });
  }
});

// =======================
// LOGOUT
// =======================

app.post("/logout", (req, res) => {
  res
    .clearCookie("token", {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      sameSite:
        process.env.NODE_ENV === "production"
          ? "none"
          : "lax",
    })
    .send({
      success: true,
    });
});

// =======================
// GET ALL FACILITIES
// =======================

app.get("/facilities", async (req, res) => {
  try {
    const search = String(
      req.query.search || "",
    ).trim();

    const type = String(
      req.query.type || "",
    ).trim();

    const query = {};

    if (search) {
      query.name = {
        $regex: search,
        $options: "i",
      };
    }

    if (type && type !== "All Sports") {
      const types = type
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (types.length > 0) {
        query.type = {
          $in: types,
        };
      }
    }

    const facilities =
      await facilitiesCollection
        .find(query)
        .toArray();

    res.send(
      facilities.map(
        normalizeFacilityDocument,
      ),
    );
  } catch (error) {
    console.error(
      "GET facilities error:",
      error,
    );

    res.status(500).send({
      message:
        "Failed to load facilities",
      error: error.message,
    });
  }
});

// =======================
// GET SINGLE FACILITY
// =======================

app.get(
  "/facilities/:id",
  async (req, res) => {
    try {
      if (
        !isValidObjectId(req.params.id)
      ) {
        return res.status(400).send({
          message:
            "Invalid facility id",
        });
      }

      const facility =
        await facilitiesCollection.findOne(
          {
            _id: new ObjectId(
              req.params.id,
            ),
          },
        );

      if (!facility) {
        return res.status(404).send({
          message:
            "Facility not found",
        });
      }

      res.send(
        normalizeFacilityDocument(
          facility,
        ),
      );
    } catch (error) {
      console.error(
        "Get single facility error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to load facility",
        error: error.message,
      });
    }
  },
);

// =======================
// ADD FACILITY
// =======================

app.post(
  "/facilities",
  verifyToken,
  async (req, res) => {
    try {
      const {
        name,
        type,
        image,
        location,
        pricePerHour,
        capacity,
        availableSlots,
        description,
      } = req.body;

      const slots = normalizeSlots(
        availableSlots,
      );

      const numericPrice = Number(
        pricePerHour,
      );

      const numericCapacity = Number(
        capacity,
      );

      if (
        !name?.trim() ||
        !type ||
        !image?.trim() ||
        !location?.trim() ||
        !description?.trim()
      ) {
        return res.status(400).send({
          message:
            "All facility fields are required",
        });
      }

      if (
        !Number.isFinite(
          numericPrice,
        ) ||
        numericPrice <= 0
      ) {
        return res.status(400).send({
          message:
            "Price per hour must be greater than 0",
        });
      }

      if (
        !Number.isFinite(
          numericCapacity,
        ) ||
        numericCapacity <= 0
      ) {
        return res.status(400).send({
          message:
            "Capacity must be greater than 0",
        });
      }

      if (slots.length === 0) {
        return res.status(400).send({
          message:
            "At least one available time slot is required",
        });
      }

      const facility = {
        name: name.trim(),
        type,
        image: image.trim(),
        location: location.trim(),
        pricePerHour:
          numericPrice,
        capacity:
          numericCapacity,
        availableSlots: slots,
        description:
          description.trim(),
        ownerEmail:
          req.user.email,
        bookingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result =
        await facilitiesCollection.insertOne(
          facility,
        );

      res.status(201).send({
        success: true,
        message:
          "Facility added successfully",
        insertedId:
          result.insertedId,
      });
    } catch (error) {
      console.error(
        "Add facility error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to add facility",
        error: error.message,
      });
    }
  },
);

// =======================
// MY FACILITIES
// =======================

app.get(
  "/my-facilities",
  verifyToken,
  async (req, res) => {
    try {
      const facilities =
        await facilitiesCollection
          .find({
            ownerEmail:
              req.user.email,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

      res.send(
        facilities.map(
          normalizeFacilityDocument,
        ),
      );
    } catch (error) {
      console.error(
        "My facilities error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to load your facilities",
        error: error.message,
      });
    }
  },
);

// =======================
// UPDATE FACILITY
// =======================

app.patch(
  "/facilities/:id",
  verifyToken,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          message:
            "Invalid facility id",
        });
      }

      const facility =
        await facilitiesCollection.findOne(
          {
            _id: new ObjectId(id),
          },
        );

      if (!facility) {
        return res.status(404).send({
          message:
            "Facility not found",
        });
      }

      if (
        facility.ownerEmail !==
        req.user.email
      ) {
        return res.status(403).send({
          message:
            "You can only update your own facility",
        });
      }

      const {
        name,
        type,
        image,
        location,
        pricePerHour,
        capacity,
        availableSlots,
        description,
      } = req.body;

      const updatedFacility = {
        name: String(
          name || "",
        ).trim(),

        type,

        image: String(
          image || "",
        ).trim(),

        location: String(
          location || "",
        ).trim(),

        pricePerHour: Number(
          pricePerHour,
        ),

        capacity: Number(capacity),

        availableSlots:
          normalizeSlots(
            availableSlots,
          ),

        description: String(
          description || "",
        ).trim(),

        updatedAt: new Date(),
      };

      if (
        !updatedFacility.name ||
        !updatedFacility.type ||
        !updatedFacility.image ||
        !updatedFacility.location ||
        !updatedFacility.description
      ) {
        return res.status(400).send({
          message:
            "All facility fields are required",
        });
      }

      if (
        !Number.isFinite(
          updatedFacility.pricePerHour,
        ) ||
        updatedFacility.pricePerHour <=
          0
      ) {
        return res.status(400).send({
          message:
            "Price per hour must be greater than 0",
        });
      }

      if (
        !Number.isFinite(
          updatedFacility.capacity,
        ) ||
        updatedFacility.capacity <= 0
      ) {
        return res.status(400).send({
          message:
            "Capacity must be greater than 0",
        });
      }

      if (
        updatedFacility
          .availableSlots.length === 0
      ) {
        return res.status(400).send({
          message:
            "At least one available time slot is required",
        });
      }

      const result =
        await facilitiesCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set:
              updatedFacility,
          },
        );

      res.send({
        success: true,
        modifiedCount:
          result.modifiedCount,
      });
    } catch (error) {
      console.error(
        "Update facility error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to update facility",
        error: error.message,
      });
    }
  },
);

// =======================
// DELETE FACILITY
// =======================

app.delete(
  "/facilities/:id",
  verifyToken,
  async (req, res) => {
    try {
      if (
        !isValidObjectId(req.params.id)
      ) {
        return res.status(400).send({
          message:
            "Invalid facility id",
        });
      }

      const facility =
        await facilitiesCollection.findOne(
          {
            _id: new ObjectId(
              req.params.id,
            ),
          },
        );

      if (!facility) {
        return res.status(404).send({
          message:
            "Facility not found",
        });
      }

      if (
        facility.ownerEmail !==
        req.user.email
      ) {
        return res.status(403).send({
          message:
            "You can only delete your own facility",
        });
      }

      const result =
        await facilitiesCollection.deleteOne(
          {
            _id: facility._id,
          },
        );

      res.send({
        success: true,
        deletedCount:
          result.deletedCount,
      });
    } catch (error) {
      console.error(
        "Delete facility error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to delete facility",
        error: error.message,
      });
    }
  },
);

// =======================
// GET BOOKINGS
// =======================

app.get(
  "/bookings",
  verifyToken,
  async (req, res) => {
    try {
      const bookings =
        await bookingsCollection
          .find({
            userEmail:
              req.user.email,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

      res.send(bookings);
    } catch (error) {
      console.error(
        "Get bookings error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to load bookings",
        error: error.message,
      });
    }
  },
);

// =======================
// CREATE BOOKING
// =======================

app.post(
  "/bookings",
  verifyToken,
  async (req, res) => {
    try {
      const {
        facilityId,
        bookingDate,
        timeSlot,
        bookingTime,
        hours,
      } = req.body;

      if (
        !isValidObjectId(facilityId)
      ) {
        return res.status(400).send({
          message:
            "Invalid facility id",
        });
      }

      const facility =
        await facilitiesCollection.findOne(
          {
            _id: new ObjectId(
              facilityId,
            ),
          },
        );

      if (!facility) {
        return res.status(404).send({
          message:
            "Facility not found",
        });
      }

      const normalizedFacility =
        normalizeFacilityDocument(
          facility,
        );

      const numericHours =
        Number(hours);

      const today = new Date()
        .toISOString()
        .split("T")[0];

      if (
        !bookingDate ||
        bookingDate < today
      ) {
        return res.status(400).send({
          message:
            "Please select a valid booking date",
        });
      }

      if (
        !timeSlot ||
        !normalizedFacility.availableSlots.includes(
          timeSlot,
        )
      ) {
        return res.status(400).send({
          message:
            "Please select a valid available time slot",
        });
      }

      if (!bookingTime) {
        return res.status(400).send({
          message:
            "Please select a preferred start time",
        });
      }

      if (
        !Number.isFinite(
          numericHours,
        ) ||
        numericHours < 1
      ) {
        return res.status(400).send({
          message:
            "Booking hours must be at least 1",
        });
      }

      if (
        !Number.isFinite(
          normalizedFacility.pricePerHour,
        ) ||
        normalizedFacility.pricePerHour <=
          0
      ) {
        return res.status(400).send({
          message:
            "Facility price is not configured correctly",
        });
      }

      const duplicateBooking =
        await bookingsCollection.findOne(
          {
            facilityId:
              normalizedFacility._id.toString(),

            userEmail:
              req.user.email,

            bookingDate,
            timeSlot,

            status: {
              $ne: "cancelled",
            },
          },
        );

      if (duplicateBooking) {
        return res.status(409).send({
          message:
            "You already have an active booking for this facility and time slot",
        });
      }

      const totalPrice =
        normalizedFacility.pricePerHour *
        numericHours;

      const booking = {
        facilityId:
          normalizedFacility._id.toString(),

        facilityName:
          normalizedFacility.name,

        facilityType:
          normalizedFacility.type,

        facilityImage:
          normalizedFacility.image,

        location:
          normalizedFacility.location,

        userEmail:
          req.user.email,

        bookingDate,
        timeSlot,
        bookingTime,

        hours: numericHours,

        pricePerHour:
          normalizedFacility.pricePerHour,

        totalPrice,

        status: "pending",

        createdAt: new Date(),
      };

      const result =
        await bookingsCollection.insertOne(
          booking,
        );

      await facilitiesCollection.updateOne(
        {
          _id:
            normalizedFacility._id,
        },
        {
          $inc: {
            bookingCount: 1,
          },
        },
      );

      res.status(201).send({
        success: true,
        message:
          "Booking created successfully",
        insertedId:
          result.insertedId,
      });
    } catch (error) {
      console.error(
        "Create booking error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to create booking",
        error: error.message,
      });
    }
  },
);

// =======================
// CANCEL BOOKING
// =======================

app.patch(
  "/bookings/:id/cancel",
  verifyToken,
  async (req, res) => {
    try {
      if (
        !isValidObjectId(req.params.id)
      ) {
        return res.status(400).send({
          message:
            "Invalid booking id",
        });
      }

      const booking =
        await bookingsCollection.findOne(
          {
            _id: new ObjectId(
              req.params.id,
            ),

            userEmail:
              req.user.email,
          },
        );

      if (!booking) {
        return res.status(404).send({
          message:
            "Booking not found",
        });
      }

      if (
        booking.status === "cancelled"
      ) {
        return res.send({
          success: true,
          message:
            "Booking is already cancelled",
        });
      }

      await bookingsCollection.updateOne(
        {
          _id: booking._id,
        },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
          },
        },
      );

      if (
        isValidObjectId(
          booking.facilityId,
        )
      ) {
        await facilitiesCollection.updateOne(
          {
            _id: new ObjectId(
              booking.facilityId,
            ),

            bookingCount: {
              $gt: 0,
            },
          },
          {
            $inc: {
              bookingCount: -1,
            },
          },
        );
      }

      res.send({
        success: true,
        message:
          "Booking cancelled successfully",
      });
    } catch (error) {
      console.error(
        "Cancel booking error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to cancel booking",
        error: error.message,
      });
    }
  },
);

// =======================
// DASHBOARD STATS
// =======================

app.get(
  "/dashboard-stats",
  verifyToken,
  async (req, res) => {
    try {
      const email =
        req.user.email;

      const myFacilities =
        await facilitiesCollection
          .find({
            ownerEmail: email,
          })
          .toArray();

      const facilityIds =
        myFacilities.map((facility) =>
          facility._id.toString(),
        );

      const myBookings =
        await bookingsCollection
          .find({
            userEmail: email,
          })
          .toArray();

      const ownerBookings =
        facilityIds.length > 0
          ? await bookingsCollection
              .find({
                facilityId: {
                  $in: facilityIds,
                },
              })
              .toArray()
          : [];

      const revenue =
        ownerBookings
          .filter(
            (booking) =>
              booking.status !==
              "cancelled",
          )
          .reduce(
            (sum, booking) =>
              sum +
              Number(
                booking.totalPrice ||
                  0,
              ),
            0,
          );

      res.send({
        totalFacilities:
          myFacilities.length,

        totalBookings:
          myBookings.length,

        activeBookings:
          myBookings.filter(
            (booking) =>
              booking.status !==
              "cancelled",
          ).length,

        cancelledBookings:
          myBookings.filter(
            (booking) =>
              booking.status ===
              "cancelled",
          ).length,

        ownerBookings:
          ownerBookings.length,

        revenue,
      });
    } catch (error) {
      console.error(
        "Dashboard stats error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to load dashboard statistics",
        error: error.message,
      });
    }
  },
);

// =======================
// HEALTH CHECK
// =======================

app.get("/", (req, res) => {
  res.send(
    "SportNest Server Running",
  );
});

// =======================
// START SERVER
// =======================

const startServer = async () => {
  try {
    await connectToDatabase();

    app.listen(port, () => {
      console.log(
        `SportNest running on port ${port}`,
      );
    });
  } catch (error) {
    console.error(
      "Server failed to start:",
      error.message,
    );

    process.exit(1);
  }
};

startServer();