import React from "react";
import Sidebar from "./Sidebar.jsx";
import Navbar from "./Navbar.jsx";

const Layout = ({ children, showSidebar = false }) => {
  return (
    <div className="h-full overflow-hidden">
      <div className="flex h-full min-h-0">
        {showSidebar && <Sidebar />}
        <div className="flex flex-1 min-h-0 flex-col">
          <Navbar />
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
