import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Receipt from "./pages/Receipt";
import Dashboard from "./pages/admin/Dashboard";
import Students from "./pages/admin/Students";
import StudentDetails from "./pages/admin/StudentDetails";
import FeeSetup from "./pages/admin/FeeSetup";
import FeeGeneration from "./pages/admin/FeeGeneration";
import Collect from "./pages/admin/Collect";
import Reports from "./pages/admin/Reports";
import Analytics from "./pages/admin/Analytics";
import Audit from "./pages/admin/Audit";
import Teachers from "./pages/admin/Teachers";
import StaffPage from "./pages/admin/Staff";
import AttendanceView from "./pages/admin/AttendanceView";
import Subjects from "./pages/admin/Subjects";
import ExamsResults from "./pages/admin/ExamsResults";
import RecycleBin from "./pages/admin/RecycleBin";
import Backup from "./pages/admin/Backup";
import Portal from "./pages/portal/Portal";
import ReportCard from "./pages/portal/ReportCard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      {/* Printable receipt (any logged-in user) */}
      <Route
        path="/receipt/:id"
        element={
          <ProtectedRoute roles={["superadmin", "admin", "parent", "student"]}>
            <Receipt />
          </ProtectedRoute>
        }
      />

      {/* Parent / student portal */}
      <Route
        path="/portal"
        element={
          <ProtectedRoute roles={["parent", "student"]}>
            <Portal />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/report-card/:studentId"
        element={
          <ProtectedRoute roles={["parent", "student"]}>
            <ReportCard />
          </ProtectedRoute>
        }
      />

      {/* Teacher attendance dashboard */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute roles={["teacher"]}>
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />

      {/* Staff area (super admin + admin) */}
      <Route
        element={
          <ProtectedRoute roles={["superadmin", "admin"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/students" element={<Students />} />
        <Route path="/admin/students/:id" element={<StudentDetails />} />
        <Route path="/admin/fees" element={<FeeSetup />} />
        <Route path="/admin/fee-generation" element={<FeeGeneration />} />
        <Route path="/admin/teachers" element={<Teachers />} />
        <Route path="/admin/staff" element={<StaffPage />} />
        <Route path="/admin/attendance" element={<AttendanceView />} />
        <Route path="/admin/subjects" element={<Subjects />} />
        <Route path="/admin/exams" element={<ExamsResults />} />
        <Route path="/admin/recycle-bin" element={<RecycleBin />} />
        <Route path="/admin/backup" element={<Backup />} />
        <Route path="/admin/collect" element={<Collect />} />
        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/analytics" element={<Analytics />} />
        <Route path="/admin/audit" element={<Audit />} />
      </Route>

      {/* Anything unknown → home, so a mistyped/stale link never shows a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
