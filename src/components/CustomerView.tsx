import { useState } from 'react';
import { CustomerManagement } from './CustomerManagement';
import { CustomerComms } from './CustomerComms';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import type { Customer, Job, MessageTemplate } from '../App';
import { Users, MessageSquare } from 'lucide-react';

interface CustomerViewProps {
  customers: Customer[];
  onUpdateCustomers: (customers: Customer[]) => void;
  onRefreshCustomers?: () => Promise<void> | void;
  jobs?: Job[];
  onRefreshJobs?: () => Promise<void> | void;
  messageTemplates: MessageTemplate[];
  onUpdateTemplates: (templates: MessageTemplate[]) => void;
}

export function CustomerView({ 
  customers, 
  onUpdateCustomers, 
  onRefreshCustomers, 
  jobs, 
  onRefreshJobs,
  messageTemplates,
  onUpdateTemplates
}: CustomerViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'customers' | 'messages'>('customers');

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={(value) => setActiveSubTab(value as 'customers' | 'messages')}>
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100 p-1">
          <TabsTrigger 
            value="customers" 
            className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:hover:bg-blue-700"
          >
            <Users className="h-4 w-4" />
            Customers
          </TabsTrigger>
          <TabsTrigger 
            value="messages" 
            className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:hover:bg-blue-700"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-6">
          <CustomerManagement
            customers={customers}
            onUpdateCustomers={onUpdateCustomers}
            onRefreshCustomers={onRefreshCustomers}
            jobs={jobs}
            onRefreshJobs={onRefreshJobs}
          />
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <CustomerComms
            customers={customers}
            messageTemplates={messageTemplates}
            onUpdateTemplates={onUpdateTemplates}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
