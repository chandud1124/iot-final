import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, User, Wifi, WifiOff, Settings, LogOut, Home, Menu, Calendar } from 'lucide-react';
import { getBackendOrigin } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
// import { Sidebar } from './Sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDevices } from '@/hooks/useDevices';
import { useSecurityNotifications } from '@/hooks/useSecurityNotifications';
import { navItems } from '@/nav-items';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/hooks/useAuth';
export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { devices } = useDevices();
  const { alerts: notifications } = useSecurityNotifications();
  const { user } = useAuth();
  
  const currentPage = navItems.find(item => item.to === location.pathname) || navItems[0];
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const userRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  
    const connectedDevices = devices.filter(device => device.status === 'online').length;
    const isConnected = connectedDevices > 0;

  // Only one dropdown open at a time
  const handleBellClick = () => {
    setShowNotifications((open) => {
      if (!open) setShowUserMenu(false);
      return !open;
    });
  };
  const handleUserClick = () => {
    setShowUserMenu((open) => {
      if (!open) setShowNotifications(false);
      return !open;
    });
  };
  const closeAll = () => {
    setShowNotifications(false);
    setShowUserMenu(false);
  };

  const handleGoogleConnect = async () => {
    try {
      const origin = getBackendOrigin();
      const res = await fetch(`${origin}/api/google-calendar/auth-url`, { credentials: 'include' });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { console.error('Non-JSON auth-url response', text.slice(0,120)); }
      if (data.url) {
        if (!data.url.includes('client_id=') || /client_id=&/.test(data.url)) {
          alert('Google OAuth client not configured (missing GOOGLE_CLIENT_ID).');
          return;
        }
        window.location.href = data.url;
      } else {
        alert('Failed to obtain Google auth URL');
      }
    } catch (e) {
      console.error('Google connect error', e);
      alert('Error initiating Google connection');
    }
  };

  const anyOpen = showNotifications || showUserMenu;

  // Outside click & ESC close
  useEffect(() => {
    if (!anyOpen) return;
    const handlePointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        notifRef.current && notifRef.current.contains(target)
      ) return;
      if (
        userRef.current && userRef.current.contains(target)
      ) return;
      // If clicked outside both dropdown areas and their trigger buttons
      closeAll();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anyOpen]);

  return (
  <header className="glass border-b border-border/50 px-6 py-4 relative z-50">
      <div className="flex items-center justify-between">
  <div className="flex items-center gap-4">
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <Sidebar className="border-none" onNavigateClose={() => {
                  const active = document.querySelector('[data-state="open"][data-vaul-sheet]');
                  // Vaul Sheet close via ESC dispatch if available
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                }} />
              </SheetContent>
            </Sheet>
          )}
          <div>
            <h1 className="text-2xl font-bold">{currentPage.title}</h1>
            <p className="text-sm text-muted-foreground">
              {location.pathname === '/' ? 'Monitor and control your IoT devices' :
               location.pathname === '/devices' ? 'Manage your connected IoT devices' :
               location.pathname === '/switches' ? 'Control individual switches' :
               location.pathname === '/master' ? 'Master control for all switches' :
               location.pathname === '/schedule' ? 'Automate your device schedules' :
               location.pathname === '/users' ? 'Manage user access and permissions' :
               location.pathname === '/settings' ? 'Configure system settings' :
               'Monitor and control your IoT devices'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Logged-in User (inline) moved before Google Connect */}
          {user && (
            <div className="hidden md:flex flex-col items-end leading-tight order-0">
              <span className="text-xs text-muted-foreground">Logged in as</span>
              <span className="text-sm font-medium truncate max-w-[140px]" title={`${user.name} (${user.email})`}>
                {user.name}
              </span>
            </div>
          )}
          {/* Google Calendar Connect */}
          <Button variant="outline" size="sm" onClick={handleGoogleConnect} className="hidden md:inline-flex order-1">
            <Calendar className="w-4 h-4 mr-1" /> Google Connect
          </Button>
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-success animate-[pulse_2s_ease-in-out_infinite]" />
                <Badge variant="outline" className="border-success/50 text-success bg-success/10 hover:bg-success/20">
                  {connectedDevices} devices online
                </Badge>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-destructive animate-[pulse_2s_ease-in-out_infinite]" />
                <Badge variant="outline" className="border-destructive/50 text-destructive bg-destructive/10 hover:bg-destructive/20">
                  Offline
                </Badge>
              </>
            )}
          </div>

          {/* Notifications */}
      <div className="relative" ref={notifRef}>
            <Button
              variant="ghost"
              size="sm"
              className={`relative ${showNotifications ? 'text-blue-600' : ''}`}
              onClick={handleBellClick}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full text-[10px] flex items-center justify-center">
                2
              </span>
            </Button>
            {showNotifications && (
        <Card className="absolute right-0 mt-2 w-80 z-[60] shadow-xl">
                <CardHeader className="pb-3">
                  <CardTitle>Notifications</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 p-0">
                  <ScrollArea className="h-[300px] px-4">
                    {notifications.length > 0 ? (
                      <div className="grid gap-4 pb-4">
                        {notifications.map((alert) => (
                          <div key={alert.id} className="grid gap-1 border-b pb-3 last:border-none">
                            <p className="text-sm font-medium">{alert.type}</p>
                            <p className="text-sm text-muted-foreground">{alert.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(alert.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">No new notifications</p>
                    )}
                  </ScrollArea>
                  <div className="border-t px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={closeAll} className="w-full">
                      Clear all
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* User Menu */}
          <div className="relative" ref={userRef}>
            <Button variant="ghost" size="sm" onClick={handleUserClick} className={showUserMenu ? 'text-blue-600' : ''}>
              <User className="w-5 h-5" />
              {user && <span className="ml-1 hidden sm:inline text-xs font-medium max-w-[90px] truncate" title={user.name}>{user.name.split(' ')[0]}</span>}
            </Button>
            {showUserMenu && (
        <Card className="absolute right-0 mt-2 w-48 z-[60] shadow-xl">
                <CardContent className="p-0">
                  {user && (
                    <div className="px-4 py-2 border-b text-left text-xs">
                      <div className="font-medium text-sm truncate" title={user.name}>{user.name}</div>
                      <div className="text-muted-foreground truncate" title={user.email}>{user.email}</div>
                      <div className="mt-1 inline-block rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        {user.role}
                      </div>
                    </div>
                  )}
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-t-lg transition-colors"
                    onClick={() => { closeAll(); navigate('/profile'); }}
                  >
                    <User className="w-4 h-4" />
                    <span>Profile</span>
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => { closeAll(); navigate('/settings'); }}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-b-lg transition-colors"
                    onClick={() => {
                      closeAll();
                      localStorage.clear();
                      navigate('/login');
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      {/* Overlay for dropdowns */}
  {/* Optional dimmed backdrop only when a dropdown open (placed after header for stacking) */}
  {anyOpen && <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40" />}
    </header>
  );
};
