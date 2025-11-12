import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import type { Customer, CustomerGroup } from '../App';
import { Plus, Pencil, Trash2, Users, GripVertical, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { createCustomerGroup, updateCustomerGroup, deleteCustomerGroup, addCustomerToGroup, removeCustomerFromGroup } from '../services/groups';
import { updateCustomer } from '../services/customers';

interface GroupManagementProps {
  customers: Customer[];
  customerGroups: CustomerGroup[];
  onRefreshCustomers?: () => Promise<void> | void;
  onRefreshCustomerGroups?: () => Promise<void> | void;
}

interface GroupFormData {
  name: string;
  workTimeMinutes: number;
  color: string;
  notes: string;
}

export function GroupManagement({ 
  customers, 
  customerGroups,
  onRefreshCustomers,
  onRefreshCustomerGroups
}: GroupManagementProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    workTimeMinutes: 60,
    color: '#9333ea',
    notes: ''
  });
  const [draggedCustomer, setDraggedCustomer] = useState<Customer | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // Filter customers that aren't in any group
  const ungroupedCustomers = customers.filter(c => !c.groupId);

  // Get customers for a specific group
  const getGroupCustomers = (group: CustomerGroup) => {
    return customers.filter(c => c.groupId === group.id);
  };

  // Get total work time for a group based on actual customers (fallback to group setting)
  const getGroupTotalTime = (group: CustomerGroup) => {
    const groupCustomers = getGroupCustomers(group);
    if (groupCustomers.length === 0) return group.workTimeMinutes;
    
    // Use group's workTimeMinutes if set, otherwise calculate from number of customers
    return group.workTimeMinutes || groupCustomers.length * 60;
  };

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      await createCustomerGroup({
        name: formData.name.trim(),
        workTimeMinutes: formData.workTimeMinutes,
        color: formData.color,
        notes: formData.notes.trim(),
        customerIds: []
      });

      await onRefreshCustomerGroups?.();
      setIsCreateDialogOpen(false);
      setFormData({ name: '', workTimeMinutes: 60, color: '#9333ea', notes: '' });
      toast.success('Group created successfully');
    } catch (error) {
      console.error('Failed to create group:', error);
      toast.error('Failed to create group');
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !formData.name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      const updatedGroup: CustomerGroup = {
        ...editingGroup,
        name: formData.name.trim(),
        workTimeMinutes: formData.workTimeMinutes,
        color: formData.color,
        notes: formData.notes.trim()
      };
      
      await updateCustomerGroup(updatedGroup);

      await onRefreshCustomerGroups?.();
      setEditingGroup(null);
      setFormData({ name: '', workTimeMinutes: 60, color: '#9333ea', notes: '' });
      toast.success('Group updated successfully');
    } catch (error) {
      console.error('Failed to update group:', error);
      toast.error('Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group? Customers will not be deleted.')) {
      return;
    }

    try {
      // First, remove all customers from the group
      const groupCustomers = customers.filter(c => c.groupId === groupId);
      for (const customer of groupCustomers) {
        const updated = { ...customer, groupId: undefined };
        await updateCustomer(updated);
      }

      // Then delete the group
      await deleteCustomerGroup(groupId);
      
      await onRefreshCustomers?.();
      await onRefreshCustomerGroups?.();
      toast.success('Group deleted successfully');
    } catch (error) {
      console.error('Failed to delete group:', error);
      toast.error('Failed to delete group');
    }
  };

  const openEditDialog = (group: CustomerGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      workTimeMinutes: group.workTimeMinutes,
      color: group.color || '#9333ea',
      notes: group.notes || ''
    });
  };

  const closeDialog = () => {
    setIsCreateDialogOpen(false);
    setEditingGroup(null);
    setFormData({ name: '', workTimeMinutes: 60, color: '#9333ea', notes: '' });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, customer: Customer) => {
    setDraggedCustomer(customer);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedCustomer(null);
    setDragOverGroup(null);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(groupId);
  };

  const handleDragLeave = () => {
    setDragOverGroup(null);
  };

  const handleDrop = async (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    setDragOverGroup(null);

    if (!draggedCustomer) return;

    try {
      // Update customer's groupId
      const updated = { ...draggedCustomer, groupId };
      await updateCustomer(updated);
      
      // Update the group's customer_ids array
      await addCustomerToGroup(groupId, draggedCustomer.id);

      await onRefreshCustomers?.();
      await onRefreshCustomerGroups?.();
      toast.success(`Added ${draggedCustomer.name} to group`);
    } catch (error) {
      console.error('Failed to add customer to group:', error);
      toast.error('Failed to add customer to group');
    }

    setDraggedCustomer(null);
  };

  const handleRemoveFromGroup = async (customer: Customer) => {
    if (!customer.groupId) return;

    try {
      // Remove customer's groupId
      const updated = { ...customer, groupId: undefined };
      await updateCustomer(updated);
      
      // Remove from group's customer_ids array
      await removeCustomerFromGroup(customer.groupId, customer.id);

      await onRefreshCustomers?.();
      await onRefreshCustomerGroups?.();
      toast.success(`Removed ${customer.name} from group`);
    } catch (error) {
      console.error('Failed to remove customer from group:', error);
      toast.error('Failed to remove customer from group');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customer Groups</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create groups and drag customers into them
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
              <DialogDescription>
                Create a group to organize multiple customers together
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Oak Ridge Neighborhood"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workTime">Total Work Time (minutes)</Label>
                <Input
                  id="workTime"
                  type="number"
                  placeholder="60"
                  value={formData.workTimeMinutes}
                  onChange={(e) => setFormData({ ...formData, workTimeMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-20 h-10"
                  />
                  <span className="text-sm text-gray-600">{formData.color}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  placeholder="Add any notes about this group..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleCreateGroup} className="bg-blue-600 hover:bg-blue-700">
                Create Group
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups List */}
      <div className="grid gap-4">
        {customerGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No groups yet</p>
              <p className="text-sm text-gray-500">Create a group to get started</p>
            </CardContent>
          </Card>
        ) : (
          customerGroups.map((group) => {
            const groupCustomers = getGroupCustomers(group);
            const isOver = dragOverGroup === group.id;
            
            return (
              <Card 
                key={group.id}
                className={`transition-all ${isOver ? 'ring-2 ring-blue-500 shadow-lg' : ''}`}
                onDragOver={(e) => handleDragOver(e, group.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, group.id)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: group.color || '#9333ea' }}
                      />
                      <div>
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                        <CardDescription>
                          {groupCustomers.length} {groupCustomers.length === 1 ? 'customer' : 'customers'} • {getGroupTotalTime(group)} min total
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Dialog open={editingGroup?.id === group.id} onOpenChange={(open) => !open && closeDialog()}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditDialog(group)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Group</DialogTitle>
                            <DialogDescription>
                              Update group details
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-name">Group Name</Label>
                              <Input
                                id="edit-name"
                                placeholder="e.g., Oak Ridge Neighborhood"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-workTime">Total Work Time (minutes)</Label>
                              <Input
                                id="edit-workTime"
                                type="number"
                                placeholder="60"
                                value={formData.workTimeMinutes}
                                onChange={(e) => setFormData({ ...formData, workTimeMinutes: parseInt(e.target.value) || 0 })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-color">Color</Label>
                              <div className="flex gap-2 items-center">
                                <Input
                                  id="edit-color"
                                  type="color"
                                  value={formData.color}
                                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                  className="w-20 h-10"
                                />
                                <span className="text-sm text-gray-600">{formData.color}</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-notes">Notes (optional)</Label>
                              <Input
                                id="edit-notes"
                                placeholder="Add any notes about this group..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                            <Button onClick={handleUpdateGroup} className="bg-blue-600 hover:bg-blue-700">
                              Update Group
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDeleteGroup(group.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {group.notes && (
                    <p className="text-sm text-gray-600 mb-4 italic">{group.notes}</p>
                  )}
                  
                  {/* Drop zone hint */}
                  {groupCustomers.length === 0 ? (
                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}>
                      <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">
                        Drag customers here to add them to this group
                      </p>
                    </div>
                  ) : (
                    <div className={`space-y-2 p-4 rounded-lg transition-colors ${
                      isOver ? 'bg-blue-50' : 'bg-gray-50'
                    }`}>
                      {groupCustomers.map((customer) => (
                        <div 
                          key={customer.id}
                          className="flex items-center justify-between bg-white p-2 rounded border border-gray-200"
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{customer.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {customer.address}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFromGroup(customer)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Ungrouped Customers */}
      {ungroupedCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ungrouped Customers</CardTitle>
            <CardDescription>
              Drag these customers into a group above
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {ungroupedCustomers.map((customer) => (
                <div
                  key={customer.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, customer)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-2 bg-white p-3 rounded border border-gray-200 cursor-move hover:shadow-md transition-shadow"
                >
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{customer.name}</p>
                    <p className="text-xs text-gray-500 truncate">{customer.address}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
