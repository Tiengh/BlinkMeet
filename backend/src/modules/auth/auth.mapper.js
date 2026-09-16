export const toPublicUser = (user) => {
  const safeUser = user?.toObject ? user.toObject() : user;

  if (!safeUser) {
    return null;
  }

  const publicUser = { ...safeUser };
  delete publicUser.user_password;

  return publicUser;
};
