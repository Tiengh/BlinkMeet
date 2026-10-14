export const toPublicUser = (user) => {
  if (!user) {return null;}
  const publicUser = { ...user };
  delete publicUser.user_password;
  delete publicUser.recommendationBucket;

  return publicUser;
};
