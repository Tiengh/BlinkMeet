import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    user_name: { type: String, require: true },
    user_email: { type: String, require: true },
    user_password: { type: String, require: true, minlength: 8 },
    user_bio: { type: String, default: "" },
    user_profilePic: { type: String, default: "" },
    user_nativeLanguage: { type: String, default: "" },
    user_learningLanguage: { type: String, default: "" },
    user_location: { type: String, default: "" },
    user_isOnboarded: { type: Boolean, default: false },
    user_friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

userSchema.pre("save", async function (next) {
  if (!this.isModified("user_password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.user_password = await bcrypt.hash(this.user_password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

export default User;
