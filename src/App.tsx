import { useState, useEffect } from "react";
import { DailySchedule } from "./components/DailySchedule";
import { InsightsDashboard } from "./components/InsightsDashboard";
import { CustomerView } from "./components/CustomerView";
import { Settings } from "./components/Settings";
import { CalendarView } from "./components/CalendarView";
import {
  Calendar,
  TrendingUp,
  Users,
  Settings as SettingsIcon,
  CalendarDays,
} from "lucide-react";
import { fetchCustomers } from "./services/customers";
import { fetchJobs } from "./services/jobs";

export interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  email?: string;
  squareFootage: number;
  price: number;
  isHilly: boolean;
  hasFencing: boolean;
  hasObstacles: boolean;
  frequency: "weekly" | "biweekly" | "monthly";
  dayOfWeek?: number; // 0-6 for Sun-Sat
  notes?: string;
  lastCutDate?: string; // ISO date string (YYYY-MM-DD)
  nextCutDate?: string; // ISO date string (YYYY-MM-DD)
  status?: "incomplete" | "complete" | "inactive";
}

export interface Job {
  id: string;
  customerId: string;
  date: string;
  scheduledTime?: string;
  startTime?: string;
  endTime?: string;
  status: "scheduled" | "in-progress" | "completed";
  totalTime?: number; // minutes
  mowTime?: number;
  trimTime?: number;
  edgeTime?: number;
  blowTime?: number;
  driveTime?: number;
  notes?: string;
  photoUrls?: string[];
  messagesSent?: string[];
  order?: number; // for maintaining stable sort order
}

export interface MessageTemplate {
  id: string;
  name: string;
  trigger: "starting" | "scheduled" | "on-the-way" | "completed" | "manual";
  message: string;
  active: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  lastMaintenance: string;
  nextMaintenance: string;
  hoursUsed: number;
  alertThreshold: number;
}

function App() {
  const [activeTab, setActiveTab] = useState("schedule");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Load customers from Supabase on mount
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const data = await fetchCustomers();
        setCustomers(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load customers:', error);
        setLoading(false);
        // Fallback to empty array - users can add new ones
      }
    };
    loadCustomers();
  }, []);

  // Expose a refresh function to children
  const refreshCustomers = async () => {
    try {
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to refresh customers:', error);
    }
  };

  const [jobs, setJobs] = useState<Job[]>([]);

  // Load jobs from Supabase on mount
  useEffect(() => {
    const loadJobs = async () => {
      try {
        const data = await fetchJobs();
        setJobs(data);
      } catch (error) {
        console.error('Failed to load jobs:', error);
      }
    };
    loadJobs();
  }, []);

  const [messageTemplates, setMessageTemplates] = useState<
    MessageTemplate[]
  >(() => {
    const saved = localStorage.getItem(
      "lawnCareMessageTemplates",
    );
    const defaultTemplates = [
      {
        id: "1",
        name: "Starting Job",
        trigger: "starting",
        message:
          "Hi {name}! We're starting work on your lawn at {address} now. Started at: {time}.",
        active: true,
      },
      {
        id: "2",
        name: "On the Way",
        trigger: "on-the-way",
        message:
          "Hi {name}! We're on our way to your property at {address}. Expected arrival: {time}.",
        active: true,
      },
      {
        id: "3",
        name: "Job Complete",
        trigger: "completed",
        message:
          "Hello {name}, we've finished servicing your lawn at {address}. Everything looks great! Let us know if you have any questions.",
        active: true,
      },
      {
        id: "4",
        name: "Reminder",
        trigger: "scheduled",
        message:
          "Hi {name}, just a reminder that we're scheduled to service your lawn today. See you soon!",
        active: true,
      },
    ];

    if (saved) {
      const existingTemplates = JSON.parse(saved);
      // Check if "starting" template exists, if not, add it
      const hasStartingTemplate = existingTemplates.some((t: MessageTemplate) => t.trigger === 'starting');
      if (!hasStartingTemplate) {
        const startingTemplate = defaultTemplates.find(t => t.trigger === 'starting');
        if (startingTemplate) {
          existingTemplates.unshift(startingTemplate); // Add at beginning
          // Update localStorage with the new template
          localStorage.setItem("lawnCareMessageTemplates", JSON.stringify(existingTemplates));
        }
      }
      return existingTemplates;
    }
    
    return defaultTemplates;
  });

  const [equipment, setEquipment] = useState<Equipment[]>(
    () => {
      const saved = localStorage.getItem("lawnCareEquipment");
      return saved
        ? JSON.parse(saved)
        : [
            {
              id: "1",
              name: "Mower - Main",
              lastMaintenance: new Date(
                Date.now() - 15 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              nextMaintenance: new Date(
                Date.now() + 15 * 24 * 60 * 60 * 1000,
              ).toISOString(),
              hoursUsed: 45,
              alertThreshold: 50,
            },
          ];
    },
  );

  // Save to localStorage when data changes
  const updateCustomers = (newCustomers: Customer[]) => {
    setCustomers(newCustomers);
    localStorage.setItem(
      "lawnCareCustomers",
      JSON.stringify(newCustomers),
    );
  };

  const updateJobs = (newJobs: Job[]) => {
    // Local setter; service updates happen in components via jobs service
    setJobs(newJobs);
  };

  const refreshJobs = async () => {
    try {
      const data = await fetchJobs();
      setJobs(data);
    } catch (error) {
      console.error('Failed to refresh jobs:', error);
    }
  };

  const updateMessageTemplates = (
    newTemplates: MessageTemplate[],
  ) => {
    setMessageTemplates(newTemplates);
    localStorage.setItem(
      "lawnCareMessageTemplates",
      JSON.stringify(newTemplates),
    );
  };

  const updateEquipment = (newEquipment: Equipment[]) => {
    setEquipment(newEquipment);
    localStorage.setItem(
      "lawnCareEquipment",
      JSON.stringify(newEquipment),
    );
  };

  const navItems = [
    { id: "schedule", label: "Today", icon: Calendar },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "insights", label: "Insights", icon: TrendingUp },
    { id: "customers", label: "Customers", icon: Users },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-50 to-emerald-50 flex items-center justify-center">
        <div className="text-green-800 text-xl">Loading customers...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-green-50 to-emerald-50 pb-20 md:pb-0">
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-green-800 mb-1">Lawn Care CRM</h1>
          <p className="text-green-600">
            Manage your crew, customers, and grow your business
          </p>
        </div>

        {/* Main Content */}
        <div className="mb-6">
          {activeTab === "schedule" && (
            <DailySchedule
              customers={customers}
              jobs={jobs}
              equipment={equipment}
              onUpdateJobs={updateJobs}
              messageTemplates={messageTemplates}
              onRefreshCustomers={refreshCustomers}
              onRefreshJobs={refreshJobs}
            />
          )}
          {activeTab === "calendar" && (
            <CalendarView
              jobs={jobs}
              customers={customers}
              onUpdateJobs={updateJobs}
              onRefreshCustomers={refreshCustomers}
              onRefreshJobs={refreshJobs}
            />
          )}
          {activeTab === "insights" && (
            <InsightsDashboard
              customers={customers}
              jobs={jobs}
              equipment={equipment}
            />
          )}
          {activeTab === "customers" && (
            <CustomerView
              customers={customers}
              onUpdateCustomers={updateCustomers}
              onRefreshCustomers={refreshCustomers}
              jobs={jobs}
              onRefreshJobs={refreshJobs}
              messageTemplates={messageTemplates}
              onUpdateTemplates={updateMessageTemplates}
            />
          )}
          {activeTab === "settings" && (
            <Settings
              equipment={equipment}
              onUpdateEquipment={updateEquipment}
            />
          )}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-3 px-2 ${
                activeTab === item.id
                  ? "text-green-600"
                  : "text-gray-500"
              }`}
            >
              <item.icon className="h-5 w-5 mb-1" />
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:block fixed top-8 right-8">
        <div className="flex gap-2 bg-white rounded-lg p-2 shadow-lg">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === item.id
                  ? "bg-green-100 text-green-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;