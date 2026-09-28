import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    user_name: { type: String, required: true, minlength: 2, maxlength: 80 },
    user_email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    user_password: { type: String, required: true, minlength: 8, select: false },
    user_bio: { type: String, maxlength: 500, default: "" },
    user_profilePic: { type: String, maxlength: 2_048, default: "" },
    user_nativeLanguage: { type: String, maxlength: 50, default: "" },
    user_learningLanguage: { type: String, maxlength: 50, default: "" },
    user_location: { type: String, maxlength: 120, default: "" },
    user_isOnboarded: { type: Boolean, default: false },
    user_friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("user_password")) {return next();}

  try {
    const salt = await bcrypt.genSalt(10);
    this.user_password = await bcrypt.hash(this.user_password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.user_password);
};

const User = mongoose.model("User", userSchema);

export default User;
