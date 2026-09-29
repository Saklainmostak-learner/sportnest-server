import "dotenv/config";
import {
  connectToDatabase,
  facilitiesCollection,
  mongoClient,
} from "../config/database.js";

const facilities = [
  {
    name: "Green Field Turf",
    type: "Football",
    image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1200&auto=format&fit=crop",
    location: "Bashundhara, Dhaka",
    pricePerHour: 1800,
    capacity: 14,
    availableSlots: ["4 PM - 6 PM", "6 PM - 8 PM", "8 PM - 10 PM"],
    description: "A well-maintained football turf with lighting for evening matches.",
  },
  {
    name: "Aqua Pro Swim",
    type: "Swimming",
    image: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?q=80&w=1200&auto=format&fit=crop",
    location: "Mirpur, Dhaka",
    pricePerHour: 1200,
    capacity: 20,
    availableSlots: ["7 AM - 9 AM", "4 PM - 6 PM", "7 PM - 9 PM"],
    description: "Indoor swimming facility with separate training and recreational lanes.",
  },
  {
    name: "Smash Point Court",
    type: "Badminton",
    image: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1200&auto=format&fit=crop",
    location: "Dhanmondi, Dhaka",
    pricePerHour: 900,
    capacity: 8,
    availableSlots: ["5 PM - 6 PM", "6 PM - 7 PM", "8 PM - 9 PM"],
    description: "Indoor badminton courts with bright lighting and smooth flooring.",
  },
  {
    name: "Ace Tennis Club",
    type: "Tennis",
    image: "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?q=80&w=1200&auto=format&fit=crop",
    location: "Gulshan, Dhaka",
    pricePerHour: 1500,
    capacity: 6,
    availableSlots: ["6 AM - 8 AM", "3 PM - 5 PM", "6 PM - 8 PM"],
    description: "Outdoor tennis court with quality surface and evening lights.",
  },
  {
    name: "Boundary Cricket Zone",
    type: "Cricket",
    image: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1200&auto=format&fit=crop",
    location: "Uttara, Dhaka",
    pricePerHour: 2200,
    capacity: 22,
    availableSlots: ["8 AM - 10 AM", "2 PM - 4 PM", "6 PM - 8 PM"],
    description: "Practice-friendly cricket ground suitable for teams and weekend matches.",
  },
  {
    name: "Iron House Gym",
    type: "Gym",
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop",
    location: "Banani, Dhaka",
    pricePerHour: 600,
    capacity: 35,
    availableSlots: ["6 AM - 8 AM", "10 AM - 12 PM", "7 PM - 9 PM"],
    description: "Modern gym zone with strength, cardio and functional training equipment.",
  },
  {
    name: "Kickoff Arena",
    type: "Football",
    image: "https://images.unsplash.com/photo-1459865264687-595d652de67e?q=80&w=1200&auto=format&fit=crop",
    location: "Mohammadpur, Dhaka",
    pricePerHour: 1600,
    capacity: 12,
    availableSlots: ["3 PM - 5 PM", "5 PM - 7 PM", "9 PM - 11 PM"],
    description: "Compact football arena for fast-paced five-a-side and seven-a-side games.",
  },
  {
    name: "Rally Indoor Court",
    type: "Badminton",
    image: "https://images.unsplash.com/photo-1613918431703-aa50889e3be9?q=80&w=1200&auto=format&fit=crop",
    location: "Badda, Dhaka",
    pricePerHour: 850,
    capacity: 8,
    availableSlots: ["4 PM - 5 PM", "7 PM - 8 PM", "9 PM - 10 PM"],
    description: "A clean indoor court with comfortable waiting space and bright court lights.",
  },
];

try {
  await connectToDatabase();

  for (const facility of facilities) {
    await facilitiesCollection.updateOne(
      { name: facility.name },
      {
        $setOnInsert: {
          ...facility,
          ownerEmail: "demo@sportnest.local",
          bookingCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  console.log("Facility seed completed.");
} catch (error) {
  console.error("Facility seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoClient.close();
}
