import User from "../user/user.model.js";

export const findUserByEmail = (email) => User.findOne({ user_email: email });
export const createUser = (data) => User.create(data);
export const updateUser = (userId, data) =>
  User.findByIdAndUpdate(userId, data, { new: true });