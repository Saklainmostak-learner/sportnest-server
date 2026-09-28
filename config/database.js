import { MongoClient, ServerApiVersion } from "mongodb";

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@ac-vrrrnum-shard-00-00.ptiwbzi.mongodb.net:27017,ac-vrrrnum-shard-00-01.ptiwbzi.mongodb.net:27017,ac-vrrrnum-shard-00-02.ptiwbzi.mongodb.net:27017/?ssl=true&replicaSet=atlas-gj74l1-shard-0&authSource=admin&appName=Cluster0`;

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