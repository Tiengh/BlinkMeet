import User from "../user/user.model.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findWithPassword = (UserModel, filter) =>
  UserModel.findOne(filter).select("+user_password");

export const findUserByEmail = async (email, { UserModel = User } = {}) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const exactUser = await findWithPassword(UserModel, {
    user_email: normalizedEmail,
  });
  if (exactUser) {return exactUser;}

  return findWithPassword(UserModel, {
    user_email: {
      $regex: `^${escapeRegex(normalizedEmail)}$`,
      $options: "i",
    },
  });
};

export const createUser = (data) => User.create(data);
export const updateUser = (userId, data) =>
  User.findByIdAndUpdate(userId, data, { new: true }).select("-user_password");
