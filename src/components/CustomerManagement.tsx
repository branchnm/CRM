import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import type { Customer, Job, CustomerGroup } from '../App';
import { Plus, Pencil, Trash2, Calendar, AlertCircle, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { deleteCustomer, addCustomer, updateCustomer } from '../services/customers';
import { updateJob } from '../services/jobs';
import { calculateNextCutDate, formatDate, isOverdue, getDaysUntil } from '../utils/dateHelpers';

interface CustomerManagementProps {
  customers: Customer[];
  customerGroups: CustomerGroup[];
  onUpdateCustomers: (customers: Customer[]) => void;
  onRefreshCustomers?: () => Promise<void> | void;
  onRefreshCustomerGroups?: () => Promise<void> | void;
  jobs?: Job[];
  onRefreshJobs?: () => Promise<void> | void;
}

export function CustomerManagement({ 
  customers, 
  customerGroups,
  onUpdateCustomers, 
  onRefreshCustomers,
  onRefreshCustomerGroups,
  jobs = [], 
  onRefreshJobs 
}: CustomerManagementProps) {
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'squareFootage' | 'nextCutDate'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<{
    name: string;
    address: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    email: string;
    squareFootage: string;
    price: string;
    isHilly: boolean;
    hasFencing: boolean;
    hasObstacles: boolean;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    dayOfWeek: string;
    notes: string;
    lastCutDate: string;
    nextCutDate: string;
    status: "incomplete" | "complete" | "inactive";
  }>({
    name: '',
    address: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
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
    lastCutDate: '',
    nextCutDate: '',
    status: 'incomplete',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      street: '',
      city: '',
      state: '',
      zipCode: '',
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
      lastCutDate: '',
      nextCutDate: '',
      status: 'incomplete',
    });
  };

  const handleAddCustomer = async () => {
    if (!formData.name || !formData.phone || !formData.squareFootage || !formData.price) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Build full address from components
    const fullAddress = [
      formData.street,
      formData.city && formData.state ? `${formData.city}, ${formData.state}` : formData.city || formData.state,
      formData.zipCode
    ].filter(Boolean).join(' ');

    try {
      const newCustomerData = {
        name: formData.name,
        address: fullAddress || formData.address, // Use combined address or fallback to single field
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
        lastCutDate: formData.lastCutDate || undefined,
        nextCutDate: formData.nextCutDate || undefined,
        status: formData.status,
      };

      const newCustomer = await addCustomer(newCustomerData);
      
      // Refresh from database to get the latest data
      if (onRefreshCustomers) {
        await onRefreshCustomers();
      } else {
        // Fallback to local state update
        onUpdateCustomers([...customers, newCustomer]);
      }
      
      resetForm();
      setIsAddingCustomer(false);
      toast.success('Customer added successfully');
    } catch (error) {
      console.error('Failed to add customer:', error);
      toast.error('Failed to add customer. Please try again.');
    }
  };

  const handleEditCustomer = async () => {
    if (!editingCustomer) return;

    // Build full address from components
    const fullAddress = [
      formData.street,
      formData.city && formData.state ? `${formData.city}, ${formData.state}` : formData.city || formData.state,
      formData.zipCode
    ].filter(Boolean).join(' ');

    try {
      const updatedCustomerData: Customer = {
        ...editingCustomer,
        name: formData.name,
        address: fullAddress || formData.address, // Use combined address or fallback
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
        lastCutDate: formData.lastCutDate || undefined,
        nextCutDate: formData.nextCutDate || undefined,
        status: formData.status,
      };

      const updatedCustomer = await updateCustomer(updatedCustomerData);
      
      // If nextCutDate changed, update any existing jobs for this customer
      if (formData.nextCutDate && formData.nextCutDate !== editingCustomer.nextCutDate) {
        const oldNextCutDate = editingCustomer.nextCutDate;
        const newNextCutDate = formData.nextCutDate;
        
        // Find the job that matches the old nextCutDate for this customer
        const jobToUpdate = jobs.find(
          job => job.customerId === editingCustomer.id && 
                 job.date === oldNextCutDate &&
                 job.status !== 'completed'
        );
        
        if (jobToUpdate) {
          // Update the job's date to match the new nextCutDate
          await updateJob({
            ...jobToUpdate,
            date: newNextCutDate
          });
          
          // Refresh jobs from database
          await onRefreshJobs?.();
        }
      }
      
      // Refresh from database to get the latest data
      if (onRefreshCustomers) {
        await onRefreshCustomers();
      } else {
        // Fallback to local state update
        const updatedCustomers = customers.map(c =>
          c.id === editingCustomer.id ? updatedCustomer : c
        );
        onUpdateCustomers(updatedCustomers);
      }

      resetForm();
      setEditingCustomer(null);
      toast.success('Customer updated');
    } catch (error) {
      console.error('Failed to update customer:', error);
      toast.error('Failed to update customer. Please try again.');
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (confirm(`Delete ${name}? This cannot be undone.`)) {
      try {
        console.log('Deleting customer with ID:', id);
        await deleteCustomer(id);
        console.log('Successfully deleted from Supabase');
        
        // Refresh from database to get the latest data
        if (onRefreshCustomers) {
          await onRefreshCustomers();
        } else {
          // Fallback to local state update
          onUpdateCustomers(customers.filter(c => c.id !== id));
        }
        
        toast.success('Customer deleted');
      } catch (error) {
        console.error('Failed to delete customer:', error);
        toast.error('Failed to delete customer. Please try again.');
      }
    }
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      address: customer.address,
      street: '',
      city: '',
      state: '',
      zipCode: '',
      phone: customer.phone,
      email: customer.email || '',
      squareFootage: customer.squareFootage.toString(),
      price: customer.price.toString(),
      isHilly: customer.isHilly,
      hasFencing: customer.hasFencing,
      hasObstacles: customer.hasObstacles,
      frequency: customer.frequency,
      dayOfWeek: customer.dayOfWeek ? customer.dayOfWeek.toString() : '',
      notes: customer.notes || '',
      lastCutDate: customer.lastCutDate || '',
      nextCutDate: customer.nextCutDate || '',
      status: customer.status || 'incomplete',
    });
  };

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Please upload a CSV or Excel file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          toast.error('CSV file is empty or has no data rows');
          return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Validate required columns
        const requiredColumns = ['name', 'address', 'phone', 'price'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
          toast.error(`Missing required columns: ${missingColumns.join(', ')}`);
          return;
        }

        let successCount = 0;
        let errorCount = 0;

        // Process each row
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: Record<string, string> = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          try {
            // Parse property size (handle different column names)
            const propertySize = parseInt(row.propertysize || row.squarefootage || row.sqft || '5000');
            const price = parseFloat(row.price || '0');
            
            // Parse frequency
            let frequency: 'weekly' | 'biweekly' | 'monthly' = 'weekly';
            const freqValue = (row.servicefrequency || row.frequency || 'weekly').toLowerCase();
            if (freqValue.includes('biweek') || freqValue.includes('bi-week')) {
              frequency = 'biweekly';
            } else if (freqValue.includes('month')) {
              frequency = 'monthly';
            }

            // Parse status - database only accepts 'incomplete', 'complete', 'inactive'
            let status: 'inactive' | 'complete' | 'incomplete' = 'incomplete';
            const statusValue = (row.status || 'incomplete').toLowerCase();
            if (statusValue === 'inactive') status = 'inactive';
            else if (statusValue === 'complete') status = 'complete';
            else if (statusValue === 'incomplete' || statusValue === 'active') status = 'incomplete';

            // Calculate next cut date if last cut date provided
            let nextCutDate = row.nextcutdate || '';
            if (!nextCutDate && row.lastcutdate) {
              const calculated = calculateNextCutDate(row.lastcutdate, frequency);
              nextCutDate = calculated || '';
            }

            const newCustomer = {
              name: row.name,
              address: row.address,
              phone: row.phone,
              email: row.email || '',
              squareFootage: propertySize,
              price: price,
              isHilly: false,
              hasFencing: false,
              hasObstacles: false,
              frequency: frequency,
              dayOfWeek: undefined,
              notes: row.notes || '',
              lastCutDate: row.lastcutdate || '',
              nextCutDate: nextCutDate,
              status: status as any,
              group: row.group && row.group.trim() ? row.group.trim() : undefined, // Import group field, ensure it's not empty string
            };

            console.log('📥 Importing customer:', newCustomer.name, 'Group:', newCustomer.group || 'none');

            await addCustomer(newCustomer);
            successCount++;
          } catch (error) {
            console.error(`Error importing row ${i}:`, error);
            errorCount++;
          }
        }

        // Refresh customer list
        if (onRefreshCustomers) {
          await onRefreshCustomers();
        }

        if (successCount > 0) {
          toast.success(`Successfully imported ${successCount} customer${successCount > 1 ? 's' : ''}`);
        }
        if (errorCount > 0) {
          toast.error(`Failed to import ${errorCount} customer${errorCount > 1 ? 's' : ''}`);
        }

      } catch (error) {
        console.error('CSV import error:', error);
        toast.error('Failed to parse CSV file. Please check the format.');
      }
    };

    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Filter and sort customers
  const filteredAndSortedCustomers = customers
    .filter(customer => {
      if (!searchQuery.trim()) return true;
      
      const query = searchQuery.toLowerCase();
      return (
        customer.name.toLowerCase().includes(query) ||
        customer.address.toLowerCase().includes(query) ||
        customer.phone.includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.squareFootage.toString().includes(query) ||
        customer.price.toString().includes(query) ||
        customer.frequency.toLowerCase().includes(query) ||
        customer.notes?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let compareA: string | number = '';
      let compareB: string | number = '';

      switch (sortBy) {
        case 'name':
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case 'price':
          compareA = a.price;
          compareB = b.price;
          break;
        case 'squareFootage':
          compareA = a.squareFootage;
          compareB = b.squareFootage;
          break;
        case 'nextCutDate':
          compareA = a.nextCutDate || '9999-12-31';
          compareB = b.nextCutDate || '9999-12-31';
          break;
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <Card className="bg-white/80 backdrop-blur">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, address, phone, email, price, size..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort by Name</SelectItem>
                  <SelectItem value="price">Sort by Price</SelectItem>
                  <SelectItem value="squareFootage">Sort by Size</SelectItem>
                  <SelectItem value="nextCutDate">Sort by Next Cut</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
          </div>
          {searchQuery && (
            <div className="mt-3 text-sm text-gray-600">
              Found {filteredAndSortedCustomers.length} of {customers.length} customers
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Customers</CardTitle>
              <CardDescription>{customers.length} total customers</CardDescription>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleCSVImport}
                className="hidden"
              />
              <Button 
                variant="outline"
                size="lg" 
                onClick={() => fileInputRef.current?.click()}
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                <Upload className="h-5 w-5 mr-2" />
                Import CSV
              </Button>
              <Dialog open={isAddingCustomer} onOpenChange={setIsAddingCustomer}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700" size="lg" onClick={resetForm}>
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
                    <Label htmlFor="address">Address</Label>
                    <div className="space-y-2">
                      <Input
                        id="street"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        placeholder="Street Address (e.g., 123 Main St)"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="City"
                        />
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          placeholder="State"
                          maxLength={2}
                        />
                      </div>
                      <Input
                        id="zipCode"
                        value={formData.zipCode}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        placeholder="ZIP Code"
                        maxLength={10}
                      />
                    </div>
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="lastCutDate">Last Cut Date</Label>
                      <Input
                        id="lastCutDate"
                        type="date"
                        value={formData.lastCutDate}
                        onChange={(e) => {
                          const lastCutDate = e.target.value;
                          const nextCutDate = lastCutDate ? calculateNextCutDate(lastCutDate, formData.frequency) : '';
                          setFormData({ ...formData, lastCutDate, nextCutDate: nextCutDate || '' });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nextCutDate">Next Cut Date (auto-calculated)</Label>
                      <Input
                        id="nextCutDate"
                        type="date"
                        value={formData.nextCutDate}
                        onChange={(e) => setFormData({ ...formData, nextCutDate: e.target.value })}
                      />
                      <p className="text-xs text-gray-500">Auto-calculated from last cut + frequency</p>
                    </div>
                  </div>

                  <Button onClick={handleAddCustomer} className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
                    Add Customer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Customer List */}
      <div className="space-y-3">
        {filteredAndSortedCustomers.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur">
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">
                {searchQuery ? 'No customers match your search.' : 'No customers yet. Add your first customer to get started!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedCustomers.map((customer) => (
            <Card key={customer.id} className="bg-white/80 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-blue-800 mb-2">{customer.name}</h3>
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
                    
                    {/* Cut Date Information */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex flex-wrap gap-3 text-sm">
                        {customer.lastCutDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="text-gray-600">Last: {formatDate(customer.lastCutDate)}</span>
                          </div>
                        )}
                        {customer.nextCutDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4 text-blue-600" />
                            <span className={`font-medium ${isOverdue(customer.nextCutDate) ? 'text-red-600' : getDaysUntil(customer.nextCutDate) === 0 ? 'text-yellow-600' : 'text-blue-600'}`}>
                              Next: {formatDate(customer.nextCutDate)}
                              {isOverdue(customer.nextCutDate) && <AlertCircle className="inline h-3 w-3 ml-1" />}
                            </span>
                            {getDaysUntil(customer.nextCutDate) !== null && (
                              <Badge 
                                variant={getDaysUntil(customer.nextCutDate)! < 0 ? "destructive" : getDaysUntil(customer.nextCutDate) === 0 ? "default" : "secondary"} 
                                className={`text-xs ${getDaysUntil(customer.nextCutDate) === 0 ? 'bg-yellow-600 hover:bg-yellow-700' : ''}`}
                              >
                                {getDaysUntil(customer.nextCutDate)! < 0 
                                  ? `${Math.abs(getDaysUntil(customer.nextCutDate)!)} days overdue` 
                                  : getDaysUntil(customer.nextCutDate) === 0
                                  ? '🔔 Cut today!'
                                  : `in ${getDaysUntil(customer.nextCutDate)} days`}
                              </Badge>
                            )}
                          </div>
                        )}
                        {!customer.lastCutDate && !customer.nextCutDate && (
                          <span className="text-gray-400 text-sm">No cut dates set</span>
                        )}
                      </div>
                    </div>
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
                            <Label htmlFor="edit-address">Address</Label>
                            <div className="space-y-2">
                              <Input
                                id="edit-street"
                                value={formData.street}
                                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                                placeholder="Street Address (e.g., 123 Main St)"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  id="edit-city"
                                  value={formData.city}
                                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                  placeholder="City"
                                />
                                <Input
                                  id="edit-state"
                                  value={formData.state}
                                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                  placeholder="State"
                                  maxLength={2}
                                />
                              </div>
                              <Input
                                id="edit-zipCode"
                                value={formData.zipCode}
                                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                                placeholder="ZIP Code"
                                maxLength={10}
                              />
                            </div>
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

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-lastCutDate">Last Cut Date</Label>
                              <Input
                                id="edit-lastCutDate"
                                type="date"
                                value={formData.lastCutDate}
                                onChange={(e) => {
                                  const lastCutDate = e.target.value;
                                  const nextCutDate = lastCutDate ? calculateNextCutDate(lastCutDate, formData.frequency) : '';
                                  setFormData({ ...formData, lastCutDate, nextCutDate: nextCutDate || '' });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-nextCutDate">Next Cut Date (auto-calculated)</Label>
                              <Input
                                id="edit-nextCutDate"
                                type="date"
                                value={formData.nextCutDate}
                                onChange={(e) => setFormData({ ...formData, nextCutDate: e.target.value })}
                              />
                              <p className="text-xs text-gray-500">Auto-calculated from last cut + frequency</p>
                            </div>
                          </div>

                          <Button onClick={handleEditCustomer} className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
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
