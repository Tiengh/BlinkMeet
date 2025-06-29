import React, { useState } from "react";
import MessengerLogo from "../public/icon.png";
import LoginImage from "../public/Login.png";
import { Link } from "react-router"; //
import useLogin from "../hooks/useLogin";

const LoginPage = () => {
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });
  console.log({ loginData });

  const { isPending, error, loginMutation } = useLogin();

  const handleLogin = (e) => {
    e.preventDefault();

    loginMutation(loginData);
  };
  return (
    <div
      className="h-screen flex items-center justify-center p-4 sm:p-6 md:p-8"
      data-theme="light"
    >
      <div className="border border-primary/25 flex flex-col lg:flex-row w-full max-w-5xl mx-auto bg-base-100 rounded-xl shadow-lg overflow-hidden">
        {/* LOGIN FORM */}
        <div className="w-full lg:w-1/2 p-4 sm:p-8 flex flex-col">
          <div className="mb-4 flex items-center justify-start gap-2">
            <img
              src={MessengerLogo}
              alt="Messenger Logo"
              className="w-9 h-9 object-contain"
            />
            <span className="text-3xl font-bold tracking-tight bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text">
              Messenger
            </span>
          </div>

          {/* ERROR MESSAGE*/}
          {error && (
            <div className="alert alert-error mb-5">
              <span>{error.response.data.message}</span>
            </div>
          )}
          <form onSubmit={handleLogin} className="w-full">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Welcome Back</h2>
                <p className="text-sm opacity-70">Login to you account!</p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              {/* Email */}
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text">Email</span>
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="input input-bordered w-full"
                  onChange={(e) =>
                    setLoginData({ ...loginData, email: e.target.value })
                  }
                />
              </div>

              {/* Password */}
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text">Password</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter password"
                  className="input input-bordered w-full"
                  onChange={(e) =>
                    setLoginData({ ...loginData, password: e.target.value })
                  }
                />
              </div>
            </div>

            {/* SUBMIT BUTTON*/}
            <button
              className="mt-4 w-full text-white font-semibold py-2 rounded-lg bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] hover:opacity-90 transition"
              type="submit"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <span className="loading loading-spinner"></span>
                  Loading...
                </>
              ) : (
                "Login"
              )}
            </button>

            {/* SIGNUP LINK */}
            <div className="text-center mt-4">
              <p className="text-sm">
                Do not have an account yet?
                <Link
                  to="/signup"
                  className="ml-1 bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text font-medium hover:underline"
                >
                  SignUp
                </Link>
              </p>
            </div>
          </form>
        </div>

        {/* IMAGE RIGHT SIDE */}
        <div className="hidden lg:flex w-full lg:w-1/2 bg-primary/10 items-center justify-center">
          <div className="max-w-md p-8">
            <div className="relative aspect-square max-w-sm mx-auto">
              <img
                src={LoginImage}
                alt="Connected by Conversation"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="text-center space-y-3 mt-6">
              <h2 className="text-xl font-semibold">
                Talk to the world, in your own words.
              </h2>
              <p className="opacity-70">
                Instantly match with people worldwide and chat freely.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
