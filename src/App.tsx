import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerNavigate } from '@/core/navigation';
import AppRoutes from '@/routes/AppRoutes';

export default function App() {
  const navigate = useNavigate();

  // lets the axios interceptor / auth service redirect with React Router
  useEffect(() => {
    registerNavigate((to) => navigate(to, { replace: true }));
  }, [navigate]);

  return <AppRoutes />;
}
