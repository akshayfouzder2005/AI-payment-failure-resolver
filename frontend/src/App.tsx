import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppShell } from "./components/shell/AppShell";
import { ProtectedRoute } from "./components/shell/ProtectedRoute";
import { GetStartedPage } from "./pages/GetStartedPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { PaymentDetailPage } from "./pages/PaymentDetailPage";
import { RecoveryLabPage } from "./pages/RecoveryLabPage";
import { AuditPage } from "./pages/AuditPage";
import { AccountPage } from "./pages/AccountPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/get-started" replace />} />
        <Route path="/get-started" element={<GetStartedPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="payments/:paymentId" element={<PaymentDetailPage />} />
          <Route path="recovery-lab" element={<RecoveryLabPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/get-started" replace />} />
      </Routes>
    </AuthProvider>
  );
}
