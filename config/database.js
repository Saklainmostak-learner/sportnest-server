import {
  MongoClient,
  ServerApiVersion,
} from "mongodb";

const dbUser = encodeURIComponent(process.env.DB_USER || "");
const dbPass = encodeURIComponent(process.env.DB_PASS || "");

const uri = `mongodb://${dbUser}:${dbPass}@ac-vrrrnum-shard-00-00.ptiwbzi.mongodb.net:27017,ac-vrrrnum-shard-00-01.ptiwbzi.mongodb.net:27017,ac-vrrrnum-shard-00-02.ptiwbzi.mongodb.net:27017/?ssl=true&replicaSet=atlas-gj74l1-shard-0&authSource=admin&appName=Cluster0`;

export const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export const db = mongoClient.db("sportnest");
export const facilitiesCollection = db.collection("facilities");
export const bookingsCollection = db.collection("bookings");

const migrateLegacyFacilities = async () => {
  const cursor = facilitiesCollection.find({
    $or: [
      { pricePerHour: { $exists: false } },
      { availableSlots: { $exists: false } },
    ],
  });

  for await (const facility of cursor) {
    const updates = {};

    if (facility.pricePerHour == null && facility.price != null) {
      const legacyPrice = Number(facility.price);
      if (Number.isFinite(legacyPrice)) {
        updates.pricePerHour = legacyPrice;
      }
    }

    if (!Array.isArray(facility.availableSlots)) {
      if (Array.isArray(facility.slots)) {
        updates.availableSlots = facility.slots.filter(Boolean);
      } else if (typeof facility.slots === "string") {
        updates.availableSlots = facility.slots
          .split(",")
          .map((slot) => slot.trim())
          .filter(Boolean);
      }
    }

    if (Object.keys(updates).length > 0) {
      await facilitiesCollection.updateOne(
        { _id: facility._id },
        { $set: updates },
      );
    }
  }
};

export const connectToDatabase = async () => {
  await mongoClient.connect();
  await db.command({ ping: 1 });
  await migrateLegacyFacilities();
  console.log("MongoDB connected successfully");
};
