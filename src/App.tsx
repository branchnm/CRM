import { useState, useEffect } from "react";
import { DailySchedule } from "./components/DailySchedule";
import { CustomerComms } from "./components/CustomerComms";
import { InsightsDashboard } from "./components/InsightsDashboard";
import { CustomerManagement } from "./components/CustomerManagement";
import { Settings } from "./components/Settings";
import {
  Calendar,
  MessageSquare,
  TrendingUp,
  Users,
  Settings as SettingsIcon,
} from "lucide-react";
import { fetchCustomers } from "./services/customers";

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
}

export interface MessageTemplate {
  id: string;
  name: string;
  trigger: "scheduled" | "on-the-way" | "completed" | "manual";
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

  const [jobs, setJobs] = useState<Job[]>(() => {
    const saved = localStorage.getItem("lawnCareJobs");
    if (saved) return JSON.parse(saved);

    // Sample job data
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];
    const fourDaysAgo = new Date(
      Date.now() - 4 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];
    const sixDaysAgo = new Date(
      Date.now() - 6 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];

    return [
      // Today's scheduled jobs
      {
        id: "j1",
        customerId: "1",
        date: today,
        scheduledTime: "08:00 AM",
        status: "scheduled" as const,
      },
      {
        id: "j2",
        customerId: "4",
        date: today,
        scheduledTime: "09:30 AM",
        status: "scheduled" as const,
      },
      {
        id: "j3",
        customerId: "6",
        date: today,
        scheduledTime: "11:00 AM",
        status: "scheduled" as const,
      },
      {
        id: "j4",
        customerId: "9",
        date: today,
        scheduledTime: "01:00 PM",
        status: "scheduled" as const,
      },
      {
        id: "j5",
        customerId: "10",
        date: today,
        scheduledTime: "02:30 PM",
        status: "scheduled" as const,
      },
      // Yesterday's completed jobs
      {
        id: "j6",
        customerId: "2",
        date: yesterday,
        scheduledTime: "08:00 AM",
        status: "completed" as const,
        totalTime: 75,
        driveTime: 8,
      },
      {
        id: "j7",
        customerId: "5",
        date: yesterday,
        scheduledTime: "10:30 AM",
        status: "completed" as const,
        totalTime: 45,
        driveTime: 5,
      },
      {
        id: "j8",
        customerId: "7",
        date: yesterday,
        scheduledTime: "12:00 PM",
        status: "completed" as const,
        totalTime: 95,
        driveTime: 10,
      },
      // Previous days
      {
        id: "j9",
        customerId: "1",
        date: twoDaysAgo,
        status: "completed" as const,
        totalTime: 40,
        driveTime: 5,
      },
      {
        id: "j10",
        customerId: "3",
        date: twoDaysAgo,
        status: "completed" as const,
        totalTime: 35,
        driveTime: 6,
      },
      {
        id: "j11",
        customerId: "4",
        date: threeDaysAgo,
        status: "completed" as const,
        totalTime: 50,
        driveTime: 4,
      },
      {
        id: "j12",
        customerId: "6",
        date: threeDaysAgo,
        status: "completed" as const,
        totalTime: 42,
        driveTime: 5,
      },
      {
        id: "j13",
        customerId: "9",
        date: fourDaysAgo,
        status: "completed" as const,
        totalTime: 48,
        driveTime: 7,
      },
      {
        id: "j14",
        customerId: "10",
        date: fourDaysAgo,
        status: "completed" as const,
        totalTime: 62,
        driveTime: 8,
      },
      {
        id: "j15",
        customerId: "2",
        date: fiveDaysAgo,
        status: "completed" as const,
        totalTime: 80,
        driveTime: 9,
      },
      {
        id: "j16",
        customerId: "5",
        date: fiveDaysAgo,
        status: "completed" as const,
        totalTime: 43,
        driveTime: 5,
      },
      {
        id: "j17",
        customerId: "7",
        date: sixDaysAgo,
        status: "completed" as const,
        totalTime: 92,
        driveTime: 10,
      },
      {
        id: "j18",
        customerId: "8",
        date: sixDaysAgo,
        status: "completed" as const,
        totalTime: 38,
        driveTime: 6,
      },
    ];
  });

  const [messageTemplates, setMessageTemplates] = useState<
    MessageTemplate[]
  >(() => {
    const saved = localStorage.getItem(
      "lawnCareMessageTemplates",
    );
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: "1",
            name: "On the Way",
            trigger: "on-the-way",
            message:
              "Hi {name}! We're on our way to your property at {address}. Expected arrival: {time}.",
            active: true,
          },
          {
            id: "2",
            name: "Job Complete",
            trigger: "completed",
            message:
              "Hello {name}, we've finished servicing your lawn at {address}. Everything looks great! Let us know if you have any questions.",
            active: true,
          },
          {
            id: "3",
            name: "Reminder",
            trigger: "scheduled",
            message:
              "Hi {name}, just a reminder that we're scheduled to service your lawn tomorrow. See you then!",
            active: false,
          },
        ];
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
    setJobs(newJobs);
    localStorage.setItem(
      "lawnCareJobs",
      JSON.stringify(newJobs),
    );
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
    { id: "insights", label: "Insights", icon: TrendingUp },
    { id: "customers", label: "Customers", icon: Users },
    { id: "messages", label: "Messages", icon: MessageSquare },
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
            <CustomerManagement
              customers={customers}
              onUpdateCustomers={updateCustomers}
            />
          )}
          {activeTab === "messages" && (
            <CustomerComms
              customers={customers}
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
        <div className="grid grid-cols-5 gap-1">
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