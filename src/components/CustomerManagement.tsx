import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import type { Customer } from '../App';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';

interface CustomerManagementProps {
  customers: Customer[];
  onUpdateCustomers: (customers: Customer[]) => void;
}

export function CustomerManagement({ customers, onUpdateCustomers }: CustomerManagementProps) {
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    squareFootage: '',
    price: '',
    isHilly: false,
    hasFencing: false,
    hasObstacles: false,
    frequency: 'weekly' as const,
    dayOfWeek: '',
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      phone: '',
      email: '',
      squareFootage: '',
      price: '',
      isHilly: false,
      hasFencing: false,
      hasObstacles: false,
      frequency: 'weekly',
      dayOfWeek: '',
      notes: '',
    });
  };

  const handleAddCustomer = () => {
    if (!formData.name || !formData.address || !formData.phone || !formData.squareFootage || !formData.price) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newCustomer: Customer = {
      id: Date.now().toString(),
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      email: formData.email,
      squareFootage: parseFloat(formData.squareFootage),
      price: parseFloat(formData.price),
      isHilly: formData.isHilly,
      hasFencing: formData.hasFencing,
      hasObstacles: formData.hasObstacles,
      frequency: formData.frequency,
      dayOfWeek: formData.dayOfWeek ? parseInt(formData.dayOfWeek) : undefined,
      notes: formData.notes,
    };

    onUpdateCustomers([...customers, newCustomer]);
    resetForm();
    setIsAddingCustomer(false);
    toast.success('Customer added successfully');
  };

  const handleEditCustomer = () => {
    if (!editingCustomer) return;

    const updatedCustomers = customers.map(c =>
      c.id === editingCustomer.id
        ? {
            ...editingCustomer,
            name: formData.name,
            address: formData.address,
            phone: formData.phone,
            email: formData.email,
            squareFootage: parseFloat(formData.squareFootage),
            price: parseFloat(formData.price),
            isHilly: formData.isHilly,
            hasFencing: formData.hasFencing,
            hasObstacles: formData.hasObstacles,
            frequency: formData.frequency,
            dayOfWeek: formData.dayOfWeek ? parseInt(formData.dayOfWeek) : undefined,
            notes: formData.notes,
          }
        : c
    );

    onUpdateCustomers(updatedCustomers);
    resetForm();
    setEditingCustomer(null);
    toast.success('Customer updated');
  };

  const handleDeleteCustomer = (id: string, name: string) => {
    if (confirm(`Delete ${name}? This cannot be undone.`)) {
      onUpdateCustomers(customers.filter(c => c.id !== id));
      toast.success('Customer deleted');
    }
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      address: customer.address,
      phone: customer.phone,
      email: customer.email || '',
      squareFootage: customer.squareFootage.toString(),
      price: customer.price.toString(),
      isHilly: customer.isHilly,
      hasFencing: customer.hasFencing,
      hasObstacles: customer.hasObstacles,
      frequency: customer.frequency,
      dayOfWeek: customer.dayOfWeek?.toString() || '',
      notes: customer.notes || '',
    });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Customers</CardTitle>
              <CardDescription>{customers.length} total customers</CardDescription>
            </div>
            <Dialog open={isAddingCustomer} onOpenChange={setIsAddingCustomer}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700" size="lg" onClick={resetForm}>
                  <Plus className="h-5 w-5 mr-2" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Customer</DialogTitle>
                  <DialogDescription>Enter customer details and property information</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address *</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Main St, City, State 12345"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email (Optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@example.com"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="squareFootage">Square Footage *</Label>
                      <Input
                        id="squareFootage"
                        type="number"
                        value={formData.squareFootage}
                        onChange={(e) => setFormData({ ...formData, squareFootage: e.target.value })}
                        placeholder="5000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Price *</Label>
                      <Input
                        id="price"
                        type="number"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="frequency">Frequency</Label>
                      <Select value={formData.frequency} onValueChange={(value: any) => setFormData({ ...formData, frequency: value })}>
                        <SelectTrigger id="frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Bi-weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Property Characteristics</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label htmlFor="isHilly">Hilly Terrain</Label>
                        <Switch
                          id="isHilly"
                          checked={formData.isHilly}
                          onCheckedChange={(checked) => setFormData({ ...formData, isHilly: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label htmlFor="hasFencing">Fencing</Label>
                        <Switch
                          id="hasFencing"
                          checked={formData.hasFencing}
                          onCheckedChange={(checked) => setFormData({ ...formData, hasFencing: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <Label htmlFor="hasObstacles">Obstacles</Label>
                        <Switch
                          id="hasObstacles"
                          checked={formData.hasObstacles}
                          onCheckedChange={(checked) => setFormData({ ...formData, hasObstacles: checked })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Special instructions, gate codes, etc."
                      rows={3}
                    />
                  </div>

                  <Button onClick={handleAddCustomer} className="w-full bg-green-600 hover:bg-green-700" size="lg">
                    Add Customer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Customer List */}
      <div className="space-y-3">
        {customers.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">No customers yet. Add your first customer to get started!</p>
            </CardContent>
          </Card>
        ) : (
          customers.map((customer) => (
            <Card key={customer.id} className="bg-white/80 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-green-800 mb-2">{customer.name}</h3>
                    <p className="text-gray-600 mb-2">{customer.address}</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge variant="outline">{customer.squareFootage.toLocaleString()} sq ft</Badge>
                      <Badge variant="outline">${customer.price}</Badge>
                      <Badge variant="outline">{customer.frequency}</Badge>
                      {customer.isHilly && <Badge variant="secondary">Hilly</Badge>}
                      {customer.hasFencing && <Badge variant="secondary">Fenced</Badge>}
                      {customer.hasObstacles && <Badge variant="secondary">Obstacles</Badge>}
                    </div>
                    <p className="text-gray-600">📞 {customer.phone}</p>
                    {customer.email && <p className="text-gray-600">✉️ {customer.email}</p>}
                    {customer.notes && <p className="text-gray-600 mt-2 text-sm italic">{customer.notes}</p>}
                  </div>
                  <div className="flex md:flex-col gap-2">
                    <Dialog open={editingCustomer?.id === customer.id} onOpenChange={(open) => !open && setEditingCustomer(null)}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="lg" onClick={() => openEditDialog(customer)}>
                          <Pencil className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Edit</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Customer</DialogTitle>
                          <DialogDescription>Update customer details</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-name">Name *</Label>
                              <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-phone">Phone *</Label>
                              <Input
                                id="edit-phone"
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="edit-address">Address *</Label>
                            <Input
                              id="edit-address"
                              value={formData.address}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-squareFootage">Square Footage *</Label>
                              <Input
                                id="edit-squareFootage"
                                type="number"
                                value={formData.squareFootage}
                                onChange={(e) => setFormData({ ...formData, squareFootage: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-price">Price *</Label>
                              <Input
                                id="edit-price"
                                type="number"
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-frequency">Frequency</Label>
                              <Select value={formData.frequency} onValueChange={(value: any) => setFormData({ ...formData, frequency: value })}>
                                <SelectTrigger id="edit-frequency">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="weekly">Weekly</SelectItem>
                                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label>Property Characteristics</Label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="flex items-center justify-between p-3 border rounded-lg">
                                <Label htmlFor="edit-isHilly">Hilly Terrain</Label>
                                <Switch
                                  id="edit-isHilly"
                                  checked={formData.isHilly}
                                  onCheckedChange={(checked) => setFormData({ ...formData, isHilly: checked })}
                                />
                              </div>
                              <div className="flex items-center justify-between p-3 border rounded-lg">
                                <Label htmlFor="edit-hasFencing">Fencing</Label>
                                <Switch
                                  id="edit-hasFencing"
                                  checked={formData.hasFencing}
                                  onCheckedChange={(checked) => setFormData({ ...formData, hasFencing: checked })}
                                />
                              </div>
                              <div className="flex items-center justify-between p-3 border rounded-lg">
                                <Label htmlFor="edit-hasObstacles">Obstacles</Label>
                                <Switch
                                  id="edit-hasObstacles"
                                  checked={formData.hasObstacles}
                                  onCheckedChange={(checked) => setFormData({ ...formData, hasObstacles: checked })}
                                />
                              </div>
                            </div>
                          </div>

                          <Button onClick={handleEditCustomer} className="w-full bg-green-600 hover:bg-green-700" size="lg">
                            Save Changes
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => handleDeleteCustomer(customer.id, customer.name)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Delete</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
