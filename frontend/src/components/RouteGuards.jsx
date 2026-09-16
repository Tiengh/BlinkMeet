import { Navigate } from "react-router";

export const RequireAuth = ({ authUser, children }) => {
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export const RequireOnboarding = ({ authUser, children }) => {
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  if (!authUser.user_isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

export const PublicOnly = ({ authUser, children }) => {
  if (authUser) {
    return (
      <Navigate
        to={authUser.user_isOnboarded ? "/" : "/onboarding"}
        replace
      />
    );
  }

  return children;
};

export const OnboardingOnly = ({ authUser, children }) => {
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  if (authUser.user_isOnboarded) {
    return <Navigate to="/" replace />;
  }

  return children;
};
