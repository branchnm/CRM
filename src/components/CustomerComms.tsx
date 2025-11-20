import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import type { Customer, MessageTemplate } from '../App';
import { MessageSquare, Send, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from './ui/badge';

interface CustomerCommsProps {
  customers: Customer[];
  messageTemplates: MessageTemplate[];
  onUpdateTemplates: (templates: MessageTemplate[]) => void;
}

export function CustomerComms({ customers, messageTemplates, onUpdateTemplates }: CustomerCommsProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<Pick<MessageTemplate, 'name' | 'trigger' | 'message' | 'active'>>({
    name: '',
    trigger: 'manual',
    message: '',
    active: true,
  });

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      trigger: 'manual',
      message: '',
      active: true,
    });
  };

  const handleSendMessage = () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomer);
    if (!customer) return;

    let message = customMessage;
    if (selectedTemplate) {
      const template = messageTemplates.find(t => t.id === selectedTemplate);
      if (template) {
        message = template.message
          .replace('{name}', customer.name)
          .replace('{address}', customer.address)
          .replace('{time}', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    }

    if (!message) {
      toast.error('Please enter a message or select a template');
      return;
    }

    // Simulate sending message
    console.log(`Sending to ${customer.phone}: ${message}`);
    toast.success(`Message sent to ${customer.name}`);
    setCustomMessage('');
    setSelectedTemplate('');
  };

  const handleAddTemplate = () => {
    if (!templateForm.name || !templateForm.message) {
      toast.error('Please fill in template name and message');
      return;
    }

    const newTemplate: MessageTemplate = {
      id: Date.now().toString(),
      ...templateForm,
    };

    onUpdateTemplates([...messageTemplates, newTemplate]);
    resetTemplateForm();
    setIsEditingTemplate(false);
    toast.success('Template added');
  };

  const handleEditTemplate = () => {
    if (!editingTemplate) return;

    const updatedTemplates = messageTemplates.map(t =>
      t.id === editingTemplate.id
        ? { ...editingTemplate, ...templateForm }
        : t
    );

    onUpdateTemplates(updatedTemplates);
    resetTemplateForm();
    setEditingTemplate(null);
    toast.success('Template updated');
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Delete this template?')) {
      onUpdateTemplates(messageTemplates.filter(t => t.id !== id));
      toast.success('Template deleted');
    }
  };

  const handleToggleTemplate = (id: string, active: boolean) => {
    const updatedTemplates = messageTemplates.map(t =>
      t.id === id ? { ...t, active } : t
    );
    onUpdateTemplates(updatedTemplates);
    toast.success(active ? 'Template activated' : 'Template deactivated');
  };

  const openEditDialog = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      trigger: template.trigger,
      message: template.message,
      active: template.active,
    });
  };

  const getTriggerLabel = (trigger: string) => {
    switch (trigger) {
      case 'scheduled': return 'Scheduled Reminder';
      case 'on-the-way': return 'On the Way';
      case 'completed': return 'Job Complete';
      default: return 'Manual';
    }
  };

  return (
    <div className="space-y-6">
      {/* Send Message Card */}
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg md:text-xl">Send Message</CardTitle>
          <CardDescription className="text-sm">Send messages to customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer</Label>
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger id="customer">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map(customer => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name} - {customer.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Template (Optional)</Label>
            <Select value={selectedTemplate} onValueChange={(value) => {
              setSelectedTemplate(value);
              const template = messageTemplates.find(t => t.id === value);
              if (template) {
                const customer = customers.find(c => c.id === selectedCustomer);
                if (customer) {
                  const message = template.message
                    .replace('{name}', customer.name)
                    .replace('{address}', customer.address)
                    .replace('{time}', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  setCustomMessage(message);
                }
              }
            }}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {messageTemplates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={4}
            />
            <p className="text-sm text-gray-600">
              Available variables: {'{name}'}, {'{address}'}, {'{time}'}
            </p>
          </div>

          <Button onClick={handleSendMessage} className="w-full bg-blue-600 hover:bg-blue-700" size="lg">
            <Send className="h-5 w-5 mr-2" />
            Send Message
          </Button>
        </CardContent>
      </Card>

      {/* Message Templates */}
      <Card className="bg-white/80 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg md:text-xl">Message Templates</CardTitle>
              <CardDescription className="text-sm">Manage automated and manual message templates</CardDescription>
            </div>
            <Dialog open={isEditingTemplate && !editingTemplate} onOpenChange={setIsEditingTemplate}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-sm" size="default" onClick={resetTemplateForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Message Template</DialogTitle>
                  <DialogDescription>Create a reusable message template</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Template Name</Label>
                    <Input
                      id="template-name"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      placeholder="e.g., Job Complete"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-trigger">Trigger</Label>
                    <Select
                      value={templateForm.trigger}
                      onValueChange={(value: MessageTemplate['trigger']) => setTemplateForm({ ...templateForm, trigger: value })}
                    >
                      <SelectTrigger id="template-trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="scheduled">Scheduled Reminder</SelectItem>
                        <SelectItem value="on-the-way">On the Way</SelectItem>
                        <SelectItem value="completed">Job Complete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-message">Message</Label>
                    <Textarea
                      id="template-message"
                      value={templateForm.message}
                      onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })}
                      placeholder="Hi {name}! We're on our way to {address}..."
                      rows={4}
                    />
                    <p className="text-sm text-gray-600">
                      Use {'{name}'}, {'{address}'}, {'{time}'} as placeholders
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label htmlFor="template-active">Active</Label>
                    <Switch
                      id="template-active"
                      checked={templateForm.active}
                      onCheckedChange={(checked) => setTemplateForm({ ...templateForm, active: checked })}
                    />
                  </div>

                  <Button onClick={handleAddTemplate} className="w-full bg-blue-600 hover:bg-blue-700">
                    Create Template
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6">
          <div className="space-y-2 md:space-y-3">
            {messageTemplates.map(template => (
              <Card key={template.id} className="bg-gray-50">
                <CardContent className="pt-3 pb-3 px-3 md:px-6 md:pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                        <h4 className="text-blue-800 text-sm md:text-base font-semibold">{template.name}</h4>
                        <Badge variant={template.active ? 'default' : 'secondary'} className={`text-xs ${template.active ? 'bg-blue-600' : ''}`}>
                          {template.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{getTriggerLabel(template.trigger)}</Badge>
                      </div>
                      <p className="text-gray-600 text-xs md:text-sm line-clamp-2">{template.message}</p>
                    </div>
                    <div className="flex gap-2">
                      <Switch
                        checked={template.active}
                        onCheckedChange={(checked) => handleToggleTemplate(template.id, checked)}
                      />
                      <Dialog open={editingTemplate?.id === template.id} onOpenChange={(open) => !open && setEditingTemplate(null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Template</DialogTitle>
                            <DialogDescription>Update template details</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-template-name">Template Name</Label>
                              <Input
                                id="edit-template-name"
                                value={templateForm.name}
                                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="edit-template-trigger">Trigger</Label>
                              <Select
                                value={templateForm.trigger}
                                onValueChange={(value: MessageTemplate['trigger']) => setTemplateForm({ ...templateForm, trigger: value })}
                              >
                                <SelectTrigger id="edit-template-trigger">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Manual</SelectItem>
                                  <SelectItem value="scheduled">Scheduled Reminder</SelectItem>
                                  <SelectItem value="on-the-way">On the Way</SelectItem>
                                  <SelectItem value="completed">Job Complete</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="edit-template-message">Message</Label>
                              <Textarea
                                id="edit-template-message"
                                value={templateForm.message}
                                onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })}
                                rows={4}
                              />
                            </div>

                            <Button onClick={handleEditTemplate} className="w-full bg-blue-600 hover:bg-blue-700">
                              Save Changes
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Automation Info */}
      <Card className="bg-blue-50/80 backdrop-blur border-blue-200">
        <CardHeader>
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-blue-600 mt-1" />
            <div>
              <CardTitle className="text-blue-800">Automated Messaging</CardTitle>
              <CardDescription className="text-blue-700">
                Templates marked as "Active" will be automatically sent when their trigger occurs:
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-blue-700">
            <li><strong>Scheduled Reminder:</strong> Sent day before scheduled service</li>
            <li><strong>On the Way:</strong> Sent when you start a job</li>
            <li><strong>Job Complete:</strong> Sent when you mark a job as complete</li>
            <li><strong>Manual:</strong> Only sent when you choose to send them</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
