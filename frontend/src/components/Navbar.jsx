import React from "react";
import useAuthUser from "../hooks/useAuthUser";
import { Link, useLocation } from "react-router";
import MessengerLogo from "../public/icon.png";
import { BellIcon, LogOutIcon, ShipWheelIcon, VideoIcon } from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import { useLogout } from "../hooks/useLogout";

const Navbar = () => {
  const { authUser } = useAuthUser();
  const location = useLocation();
  const isChatPage = location.pathname?.startsWith("/chat");
  const isRandomCallPage = location.pathname?.startsWith("/omegle")

  const { logoutMutation } = useLogout();

  return (
    <nav className="bg-base-200 border-b border-base-300 sticky top-0 z-30 h-16 flex items-center">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end w-full">
          {/* LOGO IN CHAT*/}
          {isChatPage || isRandomCallPage && (
            <div className="pl-5">
              <Link to="/" className="flex items-center gap-2.5">
                <img
                  src={MessengerLogo}
                  alt="Messenger Logo"
                  className="w-9 h-9 object-contain"
                />
                <span className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text">
                  Messenger
                </span>
              </Link>
            </div>
          )}

          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            <Link to={"/omegle"}>
              <button className="btn btn-ghost btn-circle">
                <VideoIcon className="h-6 w-6 text-base-content opacity-70" />
              </button>
            </Link>
            <Link to={"/notifications"}>
              <button className="btn btn-ghost btn-circle">
                <BellIcon className="h-6 w-6 text-base-content opacity-70" />
              </button>
            </Link>
          </div>

          <ThemeSelector />

          <div className="avatar">
            <div className="w-9 round-full">
              <img
                src={authUser?.user_profilePic}
                alt="User Avatar"
                rel="noreferrer"
              />
            </div>
          </div>

          <button className="btn btn-ghost btn-circle" onClick={logoutMutation}>
            <LogOutIcon className="h-6 w-6 text-base-content opacity-70" />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
