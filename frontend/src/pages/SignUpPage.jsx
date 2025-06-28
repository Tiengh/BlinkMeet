import React, { useState } from "react";
import MessengerLogo from "../public/icon.png";
import SignupImage from "../public/SignupImage.png";
import { Link } from "react-router"; //
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { signup } from "../lib/api";

const SignUpPage = () => {
  const [signupData, setSignupData] = useState({
    name: "",
    email: "",
    password: "",
  });
  console.log({ signupData });
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: signup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("Tạo tài khoản thành công!");
    },
  });

  const handleSignup = (e) => {
    e.preventDefault();

    mutate(signupData);
  };
  return (
    <div
      className="h-screen flex items-center justify-center p-4 sm:p-6 md:p-8"
      data-theme="light"
    >
      <div className="border border-primary/25 flex flex-col lg:flex-row w-full max-w-5xl mx-auto bg-base-100 rounded-xl shadow-lg overflow-hidden">
        {/* SIGNUP FORM */}
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
          <form onSubmit={handleSignup} className="w-full">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Create an Account</h2>
                <p className="text-sm opacity-70">
                  Join Messenger and start your journey!
                </p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              {/* Full Name */}
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text">Full Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  className="input input-bordered w-full"
                  value={signupData.name}
                  onChange={(e) =>
                    setSignupData({ ...signupData, name: e.target.value })
                  }
                />
              </div>

              {/* Email */}
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text">Email</span>
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="input input-bordered w-full"
                  value={signupData.email}
                  onChange={(e) =>
                    setSignupData({ ...signupData, email: e.target.value })
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
                  value={signupData.password}
                  onChange={(e) =>
                    setSignupData({ ...signupData, password: e.target.value })
                  }
                />
                <p className="text-xs opacity-70 mt-1">
                  Mật khẩu phải có ít nhất 8 kí tự!
                </p>
              </div>

              {/* Checkbox */}
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    required
                  />
                  <span className="text-xs leading-tight">
                    I agree to the{" "}
                    <span className="bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text font-medium hover:underline cursor-pointer">
                      term of service
                    </span>{" "}
                    and{" "}
                    <span className="bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text font-medium hover:underline cursor-pointer">
                      privacy policy
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <button
              className="mt-4 w-full text-white font-semibold py-2 rounded-lg bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] hover:opacity-90 transition"
              type="submit"
              disabled={isPending}
            >
              {isPending ? (<><span className="loading loading-spinner"></span>
                Loading...</>) : ("Create Account")}
            </button>

            {/* Login Link */}
            <div className="text-center mt-4">
              <p className="text-sm">
                Already have an account?
                <Link
                  to="/login"
                  className="ml-1 bg-gradient-to-r from-[#00B2FF] via-[#8A3FFC] to-[#FF4D67] text-transparent bg-clip-text font-medium hover:underline"
                >
                  Login
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
                src={SignupImage}
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

export default SignUpPage;
