import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./auth/auth.js";

import {
  facilitiesCollection,
  bookingsCollection,
  connectToDatabase,
} from "./config/database.js";

const app = express();

const port = process.env.PORT || 5000;

/**
 * Allowed Client Origins
 */
const allowedOrigins = [
  "http://localhost:5173",
  "https://sportnest-client-seven.vercel.app",
  "https://sportnest-client-git-main-saklainmostak-learners-projects.vercel.app",
];

/**
 * CORS
 */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },

    credentials: true,
  }),
);

/**
 * Better Auth route
 *
 * Important:
 * Better Auth handler must stay before express.json()
 */
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use(cookieParser());

/**
 * JWT Middleware
 */
const verifyToken = (req, res, next) => {
  const cookieToken = req.cookies?.token;

  const headerToken =
    req.headers.authorization?.split(" ")[1];

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

/**
 * CREATE JWT
 *
 * Better Auth session -> JWT HTTPOnly Cookie
 */
app.post("/jwt", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
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
    });
  }
});

/**
 * LOGOUT JWT COOKIE
 */
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

/**
 * GET ALL FACILITIES
 *
 * Search:
 * MongoDB $regex
 *
 * Filter:
 * MongoDB $in
 */
app.get("/facilities", async (req, res) => {
  try {
    const search = req.query.search || "";
    const type = req.query.type || "";

    const query = {};

    if (search) {
      query.name = {
        $regex: search,
        $options: "i",
      };
    }

    if (type && type !== "All Sports") {
      const types = type.split(",");

      query.type = {
        $in: types,
      };
    }

    const facilities = await facilitiesCollection
      .find(query)
      .toArray();

    res.send(facilities);
  } catch (error) {
    console.error("GET facilities error:", error);

    res.status(500).send({
      message: "Failed to load facilities",
      error: error.message,
    });
  }
});

/**
 * GET SINGLE FACILITY
 */
app.get("/facilities/:id", async (req, res) => {
  try {
    const facility =
      await facilitiesCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

    if (!facility) {
      return res.status(404).send({
        message: "Facility not found",
      });
    }

    res.send(facility);
  } catch (error) {
    console.error(
      "Get single facility error:",
      error,
    );

    res.status(500).send({
      message: "Failed to load facility",
      error: error.message,
    });
  }
});

/**
 * ADD FACILITY
 */
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

      if (
        !name ||
        !type ||
        !image ||
        !location ||
        !pricePerHour ||
        !capacity ||
        !availableSlots ||
        !description
      ) {
        return res.status(400).send({
          message:
            "All facility fields are required",
        });
      }

      const facility = {
        name: name.trim(),

        type,

        image: image.trim(),

        location: location.trim(),

        pricePerHour:
          Number(pricePerHour),

        capacity:
          Number(capacity),

        availableSlots:
          Array.isArray(availableSlots)
            ? availableSlots
            : [],

        description:
          description.trim(),

        // Owner email 
        ownerEmail:
          req.user.email,

        bookingCount: 0,

        createdAt:
          new Date(),
      };

      if (
        facility.pricePerHour <= 0
      ) {
        return res.status(400).send({
          message:
            "Price per hour must be greater than 0",
        });
      }

      if (
        facility.capacity <= 0
      ) {
        return res.status(400).send({
          message:
            "Capacity must be greater than 0",
        });
      }

      if (
        facility.availableSlots.length === 0
      ) {
        return res.status(400).send({
          message:
            "At least one available time slot is required",
        });
      }

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

        error:
          error.message,
      });
    }
  },
);

/**
 * GET MY FACILITIES
 */
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
          .toArray();

      res.send(facilities);
    } catch (error) {
      console.error(
        "My facilities error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to load your facilities",

        error:
          error.message,
      });
    }
  },
);

/**
 * UPDATE FACILITY
 */
app.patch(
  "/facilities/:id",
  verifyToken,
  async (req, res) => {
    try {
      const id =
        req.params.id;

      const facility =
        await facilitiesCollection.findOne({
          _id:
            new ObjectId(id),
        });

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

      const updatedFacility = {
        ...req.body,
      };

      /**
       * Protected fields
       *
       */
      delete updatedFacility.ownerEmail;
      delete updatedFacility._id;
      delete updatedFacility.bookingCount;
      delete updatedFacility.createdAt;

      const result =
        await facilitiesCollection.updateOne(
          {
            _id:
              new ObjectId(id),
          },
          {
            $set:
              updatedFacility,
          },
        );

      res.send(result);
    } catch (error) {
      console.error(
        "Update facility error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to update facility",

        error:
          error.message,
      });
    }
  },
);

/**
 * DELETE FACILITY
 */
app.delete(
  "/facilities/:id",
  verifyToken,
  async (req, res) => {
    try {
      const facility =
        await facilitiesCollection.findOne({
          _id:
            new ObjectId(
              req.params.id,
            ),
        });

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
            _id:
              facility._id,
          },
        );

      res.send(result);
    } catch (error) {
      console.error(
        "Delete facility error:",
        error,
      );

      res.status(500).send({
        message:
          "Failed to delete facility",

        error:
          error.message,
      });
    }
  },
);

/**
 * GET MY BOOKINGS
 */
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

        error:
          error.message,
      });
    }
  },
);

/**
 * CREATE BOOKING
 */
app.post(
  "/bookings",
  verifyToken,
  async (req, res) => {
    try {
      const bookingData =
        req.body;

      const facility =
        await facilitiesCollection.findOne({
          _id:
            new ObjectId(
              bookingData.facilityId,
            ),
        });

      if (!facility) {
        return res.status(404).send({
          message:
            "Facility not found",
        });
      }

      const hours =
        Number(
          bookingData.hours,
        );

      if (
        !hours ||
        hours < 1
      ) {
        return res.status(400).send({
          message:
            "Booking hours must be at least 1",
        });
      }

      const totalPrice =
        Number(
          facility.pricePerHour,
        ) * hours;

      const booking = {
        facilityId:
          facility._id.toString(),

        facilityName:
          facility.name,

        userEmail:
          req.user.email,

        bookingDate:
          bookingData.bookingDate,

        timeSlot:
          bookingData.timeSlot,

        hours,

        totalPrice,

        status:
          "pending",

        createdAt:
          new Date(),
      };

      const result =
        await bookingsCollection.insertOne(
          booking,
        );

      await facilitiesCollection.updateOne(
        {
          _id:
            facility._id,
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

        error:
          error.message,
      });
    }
  },
);

/**
 * CANCEL BOOKING
 */
app.patch(
  "/bookings/:id/cancel",
  verifyToken,
  async (req, res) => {
    try {
      const result =
        await bookingsCollection.updateOne(
          {
            _id:
              new ObjectId(
                req.params.id,
              ),

            userEmail:
              req.user.email,
          },
          {
            $set: {
              status:
                "cancelled",
            },
          },
        );

      if (
        !result.matchedCount
      ) {
        return res.status(404).send({
          message:
            "Booking not found",
        });
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

        error:
          error.message,
      });
    }
  },
);

/**
 * DASHBOARD STATS
 */
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
            ownerEmail:
              email,
          })
          .toArray();

      const facilityIds =
        myFacilities.map(
          (facility) =>
            facility._id.toString(),
        );

      const myBookings =
        await bookingsCollection
          .find({
            userEmail:
              email,
          })
          .toArray();

      const ownerBookings =
        facilityIds.length > 0
          ? await bookingsCollection
              .find({
                facilityId: {
                  $in:
                    facilityIds,
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
            (
              sum,
              booking,
            ) =>
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

        error:
          error.message,
      });
    }
  },
);

/**
 * SERVER HEALTH CHECK
 */
app.get("/", (req, res) => {
  res.send(
    "SportNest Server Running",
  );
});

/**
 * START SERVER
 */
const startServer = async () => {
  try {
    await connectToDatabase();

    app.listen(port, () => {
      console.log(`SportNest running on port ${port}`);
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