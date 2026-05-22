const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  "https://sportnest-client-seven.vercel.app",
  "https://sportnest-client-git-main-saklainmostak-learners-projects.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-vrrrnum-shard-00-00.ptiwbzi.mongodb.net:27017,ac-vrrrnum-shard-00-01.ptiwbzi.mongodb.net:27017,ac-vrrrnum-shard-00-02.ptiwbzi.mongodb.net:27017/?ssl=true&replicaSet=atlas-gj74l1-shard-0&authSource=admin&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db("sportnest");

    const facilitiesCollection = db.collection("facilities");
    const bookingsCollection = db.collection("bookings");

    // JWT
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        });

      app.post("/logout", async (req, res) => {
        res
          .clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          });

        // GET ALL FACILITIES
        app.get("/facilities", async (req, res) => {
          const search = req.query.search || "";
          const type = req.query.type || "";

          const query = {
            name: {
              $regex: search,
              $options: "i",
            },
          };

          if (type && type !== "All Sports") {
            query.type = type;
          }

          const result = await facilitiesCollection.find(query).toArray();

          res.send(result);
        });

        // GET SINGLE FACILITY
        app.get("/facilities/:id", async (req, res) => {
          const id = req.params.id;

          const result = await facilitiesCollection.findOne({
            _id: new ObjectId(id),
          });

          res.send(result);
        });

        // ADD FACILITY
        app.post("/facilities", verifyToken, async (req, res) => {
          const facility = req.body;

          const result = await facilitiesCollection.insertOne(facility);

          res.send(result);
        });

        // UPDATE FACILITY
        app.patch("/facilities/:id", verifyToken, async (req, res) => {
          const id = req.params.id;

          const updatedFacility = req.body;

          const result = await facilitiesCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: updatedFacility,
            }
          );

          res.send(result);
        });

        // DELETE FACILITY
        app.delete("/facilities/:id", verifyToken, async (req, res) => {
          const id = req.params.id;

          const result = await facilitiesCollection.deleteOne({
            _id: new ObjectId(id),
          });

          res.send(result);
        });

        // GET BOOKINGS
        app.get("/bookings", verifyToken, async (req, res) => {
          const email = req.query.email;

          if (req.user.email !== email) {
            return res.status(403).send({
              message: "Forbidden access",
            });
          }

          const result = await bookingsCollection
            .find({
              userEmail: email,
            })
            .toArray();

          res.send(result);
        });

        // CREATE BOOKING
        app.post("/bookings", verifyToken, async (req, res) => {
          const booking = req.body;

          booking.status = "pending";

          const result = await bookingsCollection.insertOne(booking);

          res.send(result);
        });

        // CANCEL BOOKING
        app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
          const id = req.params.id;

          const result = await bookingsCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                status: "cancelled",
              },
            }
          );

          res.send(result);
        });

        // DASHBOARD STATS
        app.get("/dashboard-stats", verifyToken, async (req, res) => {
          const email = req.query.email;

          if (req.user.email !== email) {
            return res.status(403).send({
              message: "Forbidden access",
            });
          }

          const myFacilities = await facilitiesCollection
            .find({
              ownerEmail: email,
            })
            .toArray();

          const facilityIds = myFacilities.map((facility) =>
            facility._id.toString()
          );

          const myBookings = await bookingsCollection
            .find({
              userEmail: email,
            })
            .toArray();

          const ownerBookings = await bookingsCollection
            .find({
              facilityId: {
                $in: facilityIds,
              },
            })
            .toArray();

          const revenue = ownerBookings.reduce(
            (sum, booking) => sum + Number(booking.totalPrice || 0),
            0
          );

          res.send({
            totalFacilities: myFacilities.length,
            totalBookings: myBookings.length,
            activeBookings: myBookings.filter(
              (booking) => booking.status !== "cancelled"
            ).length,
            cancelledBookings: myBookings.filter(
              (booking) => booking.status === "cancelled"
            ).length,
            ownerBookings: ownerBookings.length,
            revenue,
          });
        });
        console.log("SportNest MongoDB Connected");
      } finally {
      }
    }

run().catch(console.dir);

    app.get("/", (req, res) => {
      res.send("SportNest Server Running");
    });

    app.listen(port, () => {
      console.log(`SportNest running on port ${port}`);
    });