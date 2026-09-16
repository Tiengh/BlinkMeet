import mongoose from "mongoose";

export const connectMongoDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URL);
    console.log(`MongoDB Connected: ${connection.connection.host}`);
  } catch (error) {
    console.log(`Error connect to MongoDB: ${error}`);
    process.exit(1);
  }
};