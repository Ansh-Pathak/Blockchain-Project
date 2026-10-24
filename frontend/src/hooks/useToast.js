import { useContext } from "react";
import { ToastContext } from "../components/Toast";

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (msg) => console.log("Toast:", msg),
    };
  }
  return ctx;
}
