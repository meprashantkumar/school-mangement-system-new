import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

// Attach the JWT to every request if we have one.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the session expires or the token becomes invalid mid-use, every call 401s.
// Clear the stale token and bounce to login instead of leaving the user on a
// screen where nothing works. Auth endpoints are excluded so a wrong-password
// 401 on the login screen still shows its own error (no surprise redirect).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url || "";
    if (error?.response?.status === 401 && !url.includes("/auth/")) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
