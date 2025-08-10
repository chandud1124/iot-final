import React, { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users as UsersIcon, Plus, Shield, User, Edit, Trash2, GraduationCap, ShieldCheck, RefreshCcw, Search } from 'lucide-react';
import { UserDialog } from '@/components/UserDialog';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'security' | 'faculty';
  isActive: boolean;
  lastLogin: Date;
  assignedDevices: string[];
  department?: string;
  accessLevel: 'full' | 'limited' | 'readonly';
}

const Users = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(9); // 3 cards per row * 3 rows
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [me, setMe] = useState<string | null>(null);

  // load self id once
  useEffect(() => {
    const stored = localStorage.getItem('user_data');
    if (stored) {
      try { setMe(JSON.parse(stored).id); } catch {}
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { page, limit };
      if (search.trim()) params.search = search.trim();
      const response = await api.get('/users', { params });
      const payload = response.data;
      const list = payload.data || [];
      const normalized = list.map((u: any) => ({
        id: u._id || u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        lastLogin: u.lastLogin ? new Date(u.lastLogin) : new Date(),
        assignedDevices: u.assignedDevices || [],
        department: u.department,
        accessLevel: u.accessLevel || 'limited'
      }));
      setUsers(normalized);
      setTotalPages(payload.totalPages || 1);
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to fetch users', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const handleAddUser = async (userData: any) => {
    try {
      const response = await api.post('/users', userData);
      const raw = response.data.user || response.data; // backend returns { user, tempPassword? }
      const mapped: User = {
        id: raw._id || raw.id,
        name: raw.name,
        email: raw.email,
        role: raw.role,
        isActive: raw.isActive,
        lastLogin: raw.lastLogin ? new Date(raw.lastLogin) : new Date(),
        assignedDevices: raw.assignedDevices || [],
        department: raw.department,
        accessLevel: raw.accessLevel || 'limited'
      };
      setUsers(prev => [mapped, ...prev]);
      toast({ title: 'User Added', description: `${userData.name} added successfully` });
      // Refetch to update pagination counts if needed
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to add user', variant: 'destructive' });
    }
  };

  const handleEditUser = async (userData: any) => {
    if (!editingUser) return;
    try {
      const response = await api.put(`/users/${editingUser.id}`, userData);
      const updated = response.data;
      setUsers(prev => prev.map(u => u.id === editingUser.id ? {
        id: updated._id || updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        lastLogin: updated.lastLogin ? new Date(updated.lastLogin) : new Date(),
        assignedDevices: updated.assignedDevices || [],
        department: updated.department,
        accessLevel: updated.accessLevel || 'limited'
      } : u));
      setEditingUser(null);
      toast({ title: 'User Updated', description: `${userData.name} updated successfully` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to update user', variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await api.delete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast({ title: 'User Deleted', description: 'User removed successfully' });
      if (users.length === 1 && page > 1) {
        setPage(p => p - 1); // move back a page if last item removed
      } else {
        fetchUsers();
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to delete user', variant: 'destructive' });
    }
  };

  const toggleUserStatus = async (userId: string) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      if (me && me === userId && user.isActive) {
        toast({ title: 'Action Blocked', description: 'You cannot deactivate your own account', variant: 'destructive' });
        return;
      }
      try {
        const response = await api.patch(`/users/${userId}/status`, { isActive: !user.isActive });
        const updated = response.data;
        setUsers(prev => prev.map(u => u.id === userId ? {
          id: updated._id || updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          isActive: updated.isActive,
          lastLogin: updated.lastLogin ? new Date(updated.lastLogin) : new Date(),
          assignedDevices: updated.assignedDevices || [],
          department: updated.department,
          accessLevel: updated.accessLevel || 'limited'
        } : u));
        toast({ title: 'Status Updated', description: `User ${updated.isActive ? 'activated' : 'deactivated'} successfully` });
        return;
      } catch (errPatch: any) {
        // If PATCH blocked by CORS or 405, fallback to POST
        if (!errPatch.response || [405, 404].includes(errPatch.response.status) || errPatch.message?.includes('Network') ) {
          try {
            const response = await api.post(`/users/${userId}/status`, { isActive: !user.isActive });
            const updated = response.data;
            setUsers(prev => prev.map(u => u.id === userId ? {
              id: updated._id || updated.id,
              name: updated.name,
              email: updated.email,
              role: updated.role,
              isActive: updated.isActive,
              lastLogin: updated.lastLogin ? new Date(updated.lastLogin) : new Date(),
              assignedDevices: updated.assignedDevices || [],
              department: updated.department,
              accessLevel: updated.accessLevel || 'limited'
            } : u));
            toast({ title: 'Status Updated (Fallback)', description: `User ${updated.isActive ? 'activated' : 'deactivated'} successfully` });
            return;
          } catch (errPost: any) {
            throw errPost;
          }
        }
        throw errPatch;
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to update user status', variant: 'destructive' });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'faculty': return <GraduationCap className="w-4 h-4" />;
      case 'security': return <ShieldCheck className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'faculty': return 'secondary';
      case 'security': return 'destructive';
      default: return 'outline';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatLastLogin = (value: any) => {
    try {
      const date = value instanceof Date ? value : new Date(value);
      if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
      const now = Date.now();
      const diff = now - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return date.toLocaleDateString();
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage faculty, security, and student access</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearch(searchInput); } }}
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={() => { setPage(1); setSearch(searchInput); }} disabled={loading}>
            <Search className="w-4 h-4 mr-1" /> Go
          </Button>
          <Button variant="outline" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <Button onClick={() => setDialogOpen(true)} disabled={loading}>
            <Plus className="w-4 h-4 mr-2" /> Add User
          </Button>
        </div>
      </div>

      {loading && users.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">Loading users...</div>
      )}

      {!loading && users.length === 0 ? (
        <div className="text-center py-12">
          <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No users found</h3>
          <p className="text-muted-foreground mb-4">Add users to manage system access</p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add First User
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <Card key={user.id} className={user.isActive ? '' : 'opacity-75'}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {user.name}
                      {me === user.id && (
                        <Badge variant="outline" className="text-[10px]">You</Badge>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground truncate" title={user.email}>{user.email}</p>
                    {user.department && (
                      <p className="text-xs text-muted-foreground">{user.department}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Role:</span>
                    <Badge variant={getRoleColor(user.role)} className="flex items-center gap-1 capitalize">
                      {getRoleIcon(user.role)} {user.role}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge variant={user.isActive ? 'default' : 'secondary'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Access:</span>
                    <Badge variant="outline" className="capitalize">{user.accessLevel}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Last Login:</span>
                    <span className="text-xs text-muted-foreground">{formatLastLogin(user.lastLogin)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Devices:</span>
                    <span className="text-xs text-muted-foreground">{user.assignedDevices.length}</span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingUser(user); setDialogOpen(true); }}>
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant={user.isActive ? 'secondary' : 'default'} onClick={() => toggleUserStatus(user.id)} disabled={me === user.id && user.isActive}>
                      {user.isActive ? (me === user.id ? 'Self' : 'Deactivate') : 'Activate'}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteUser(user.id)} disabled={me === user.id}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => page > 1 && setPage(p => p - 1)} className={page === 1 ? 'pointer-events-none opacity-50' : ''} />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext onClick={() => page < totalPages && setPage(p => p + 1)} className={page === totalPages ? 'pointer-events-none opacity-50' : ''} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <UserDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingUser(null); }}
        onSave={editingUser ? handleEditUser : handleAddUser}
        user={editingUser}
      />
    </div>
  );
};

export default Users;
