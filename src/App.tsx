
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Layout } from "@/components/Layout";
import Index from "./pages/Index";
import Devices from "./pages/Devices";
import Switches from "./pages/Switches";
import Master from "./pages/Master";
import Schedule from "./pages/Schedule";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import Login from "./pages/Login";
import { Profile } from "./pages/Profile";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import { PrivateRoute } from "./components/PrivateRoute";
import { GlobalLoadingProvider } from '@/hooks/useGlobalLoading';
import { GlobalLoadingOverlay } from '@/components/GlobalLoadingOverlay';

const queryClient = new QueryClient();

import { DevicesProvider } from '@/hooks/useDevices';
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoadingProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}>
          <Routes>
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:resetToken" element={<ResetPassword />} />
            
            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <DevicesProvider>
                    <Layout>
                      <Outlet />
                    </Layout>
                  </DevicesProvider>
                </PrivateRoute>
              }
            >
              <Route index element={<Index />} />
              <Route path="devices" element={<Devices />} />
              <Route path="switches" element={<Switches />} />
              <Route path="master" element={<Master />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <GlobalLoadingOverlay />
      </TooltipProvider>
      </GlobalLoadingProvider>
    </QueryClientProvider>
  );
};

export default App;
