import React from "react";
import useAuthUser from "../hooks/useAuthUser";
import { Link } from "react-router";
import BlinkMeetLogo from "../public/icon2.png";

import { BellIcon, LogOutIcon, VideoIcon } from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import { useLogout } from "../hooks/useLogout";

const Navbar = ({ showBrand = false }) => {
  const { authUser } = useAuthUser();
  const { logoutMutation } = useLogout();

  return (
    <nav className="z-30 flex h-16 w-full shrink-0 items-center border-b border-base-300 bg-base-200">
      <div className="flex w-full min-w-0 items-center px-4 sm:px-6 lg:px-8">
        {showBrand && (
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img
              src={BlinkMeetLogo}
              alt="BlinkMeet Logo"
              className="size-9 shrink-0 object-contain"
            />
            <span className="hidden truncate text-2xl font-bold tracking-tight bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text sm:block">
              BlinkMeet
            </span>
          </Link>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
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

          <ThemeSelector />

          <div className="avatar">
            <div className="w-9 rounded-full">
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
