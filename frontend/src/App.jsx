import React from "react";
import { Route, Routes, Navigate } from "react-router";
import HomePage from "./pages/HomePage.jsx";
import CallPage from "./pages/CallPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import NotificationsPage from "./pages/NotificationsPages.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import { Toaster } from "react-hot-toast";
import PageLoader from "./components/PageLoader.jsx";
import useAuthUser from "./hooks/useAuthUser.js";
import Layout from "./components/Layout.jsx";
import { useThemeStore } from "./stores/useThemeStore.js";
import FriendPage from "./pages/FriendPage.jsx";
import OmeglePage from "./pages/OmeglePage.jsx";
import {
  OnboardingOnly,
  PublicOnly,
  RequireOnboarding,
} from "./components/RouteGuards.jsx";
import RealtimeProvider from "./components/RealtimeProvider.jsx";

const App = () => {
  const { isLoading, authUser } = useAuthUser();
  const { theme } = useThemeStore();
  if (isLoading) {return <PageLoader />;}

  return (
    <div className="h-full" data-theme={theme}>
      <RealtimeProvider key={authUser?._id || "anonymous"} userId={authUser?._id}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireOnboarding authUser={authUser}>
                <Layout showSidebar={true}>
                  <HomePage />
                </Layout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/login"
            element={
              <PublicOnly authUser={authUser}>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnly authUser={authUser}>
                <SignUpPage />
              </PublicOnly>
            }
          />
          <Route
            path="/call/:id"
            element={
              <RequireOnboarding authUser={authUser}>
                <CallPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/omegle"
            element={
              <RequireOnboarding authUser={authUser}>
                <OmeglePage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/chat/:id"
            element={
              <RequireOnboarding authUser={authUser}>
                <Layout showSidebar={false}>
                  <ChatPage />
                </Layout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireOnboarding authUser={authUser}>
                <Layout showSidebar={true}>
                  <NotificationsPage />
                </Layout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/friends"
            element={
              <RequireOnboarding authUser={authUser}>
                <Layout showSidebar={true}>
                  <FriendPage />
                </Layout>
              </RequireOnboarding>
            }
          />
          <Route
            path="/onboarding"
            element={
              <OnboardingOnly authUser={authUser}>
                <OnboardingPage />
              </OnboardingOnly>
            }
          />
        </Routes>
        <Toaster position="top-right" />
      </RealtimeProvider>
    </div>
  );
};

export default App;
