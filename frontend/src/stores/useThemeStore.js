import { create } from "zustand";

export const useThemeStore = create((set) => ({
  theme: localStorage.getItem("messenGer-theme") || "light",
  setTheme: (theme) => {
    localStorage.setItem("messenGer-theme", theme);
    set({ theme });
  },
}));
