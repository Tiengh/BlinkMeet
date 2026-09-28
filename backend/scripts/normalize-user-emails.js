import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/modules/user/user.model.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const dryRun = process.argv.includes("--dry-run");

const migrate = async () => {
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is required");
  }

  await mongoose.connect(process.env.MONGO_URL, { autoIndex: false });

  const users = await User.find({})
    .select("_id user_email")
    .lean();
  const ownersByEmail = new Map();
  const collisions = [];
  const updates = [];

  for (const user of users) {
    const originalEmail = String(user.user_email || "");
    const normalizedEmail = normalizeEmail(originalEmail);
    if (!normalizedEmail) {
      throw new Error(`User ${user._id} has an empty email`);
    }

    const existingOwner = ownersByEmail.get(normalizedEmail);
    if (existingOwner) {
      collisions.push({
        email: normalizedEmail,
        userIds: [existingOwner, String(user._id)],
      });
      continue;
    }
    ownersByEmail.set(normalizedEmail, String(user._id));

    if (originalEmail !== normalizedEmail) {
      updates.push({
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { user_email: normalizedEmail } },
        },
      });
    }
  }

  if (collisions.length) {
    console.error("Email normalization collisions detected:");
    collisions.forEach((collision) => console.error(collision));
    throw new Error("Resolve email collisions before running the migration again");
  }

  console.log(`Users scanned: ${users.length}`);
  console.log(`Emails requiring normalization: ${updates.length}`);

  if (dryRun) {
    console.log("Dry run complete. No data was changed.");
    return;
  }

  if (updates.length) {
    await User.bulkWrite(updates, { ordered: true });
  }
  await User.syncIndexes();
  console.log("Email normalization migration completed.");
};

try {
  await migrate();
} catch (error) {
  console.error("Email normalization migration failed:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
