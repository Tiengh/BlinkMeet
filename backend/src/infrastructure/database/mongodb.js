import mongoose from "mongoose";

export const mongoConnectionOptions = (uri, env = process.env) => {
  if (env.NODE_ENV !== "production") {return {};}
  const parsed = new URL(uri);
  const unsafeOptions = new Map([
    ["tlsinsecure", "true"],
    ["tlsallowinvalidcertificates", "true"],
    ["tlsallowinvalidhostnames", "true"],
    ["tls", "false"],
    ["ssl", "false"],
  ]);
  for (const [key, value] of parsed.searchParams) {
    if (unsafeOptions.get(key.toLowerCase()) === value.toLowerCase()) {
      throw new Error(`Unsafe MongoDB TLS option: ${key}`);
    }
  }
  return { tls: true };
};

export const connectMongoDB = async () => {
  try {
    const connection = await mongoose.connect(
      process.env.MONGO_URL,
      mongoConnectionOptions(process.env.MONGO_URL),
    );
    console.log(`MongoDB Connected: ${connection.connection.host}`);
  } catch (error) {
    console.log(`Error connect to MongoDB: ${error}`);
    process.exit(1);
  }
};
