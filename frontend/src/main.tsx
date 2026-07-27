import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { SCHOOL } from "./lib/school";
import "./index.css";

// Reflect the configured school in the browser tab + meta description.
document.title = SCHOOL.fullName;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute(
    "content",
    `${SCHOOL.fullName} — parent & staff portal for fees, receipts and school updates.`
  );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
