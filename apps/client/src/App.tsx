import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import LoginPage    from '@/pages/LoginPage';
import PaymentsPage from '@/pages/PaymentsPage';
import TakeoverPage from '@/pages/TakeoverPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/payments" replace />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/takeover" element={<TakeoverPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/payments" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: '14px', maxWidth: '360px' },
          success: { iconTheme: { primary: '#ec4899', secondary: '#fff' } },
        }}
      />
    </AuthProvider>
  );
}
