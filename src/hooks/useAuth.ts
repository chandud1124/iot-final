
import { useState, useEffect, useRef } from 'react';
import { authAPI } from '@/services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  accessLevel: string;
  assignedDevices: string[];
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user_data');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('auth_token');
  });

  // Debounce auth check to avoid duplicate rapid mounts
  const authCheckScheduled = useRef(false);
  useEffect(() => {
    if (!authCheckScheduled.current) {
      authCheckScheduled.current = true;
      setTimeout(() => {
        checkAuthStatus();
      }, 50);
    }
  }, []);

  const checkAuthStatus = async () => {
  if ((window as any).__authProfileInFlight) return; // simple client guard
  (window as any).__authProfileInFlight = true;
    try {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setLoading(false);
        setIsAuthenticated(false);
        return;
      }

      try {
        // Verify token with backend by fetching the user profile
        const response = await authAPI.getProfile();
        const userData = response.data.user;

        setUser(userData);
        setIsAuthenticated(true);
      } catch (error) {
        // If token verification fails, clear storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      logout();
    } finally {
      setLoading(false);
  (window as any).__authProfileInFlight = false;
    }
  };

  const login = (userData: User, token: string) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateProfile = async (data: {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    delete?: boolean;
  }) => {
    try {
      if (data.delete) {
        await authAPI.deleteAccount();
        logout();
        return;
      }

      const response = await authAPI.updateProfile(data);
      const updatedUser = response.data.user;
      setUser(updatedUser);
      localStorage.setItem('user_data', JSON.stringify(updatedUser));
      return updatedUser;
    } catch (error) {
      throw error;
    }
  };

  return {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    updateProfile
  };
};
