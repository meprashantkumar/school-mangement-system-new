import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
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
// The label under the icon when an iPhone adds this to the home screen (Android
// takes it from the manifest instead). Short name keeps it from being truncated.
document
  .querySelector('meta[name="apple-mobile-web-app-title"]')
  ?.setAttribute("content", SCHOOL.shortName || SCHOOL.name);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <App />
          <Toaster position="top-right" />
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
