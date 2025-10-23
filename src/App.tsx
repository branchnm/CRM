import { useState } from "react";
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

  // Load data from localStorage with sample data
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem("lawnCareCustomers");
    if (saved) return JSON.parse(saved);

    // Sample customer data
    return [
      {
        id: "1",
        name: "Johnson Residence",
        address: "1234 Maple Street, Springfield, IL 62701",
        phone: "(217) 555-0123",
        email: "mjohnson@email.com",
        squareFootage: 5000,
        price: 45,
        isHilly: false,
        hasFencing: true,
        hasObstacles: false,
        frequency: "weekly",
        notes:
          "Gate code: 1234. Dog in backyard - call before entering.",
      },
      {
        id: "2",
        name: "Smith Estate",
        address: "5678 Oak Avenue, Springfield, IL 62702",
        phone: "(217) 555-0456",
        email: "smith.family@email.com",
        squareFootage: 12000,
        price: 95,
        isHilly: true,
        hasFencing: false,
        hasObstacles: true,
        frequency: "weekly",
        notes:
          "Large property with multiple flower beds and trees.",
      },
      {
        id: "3",
        name: "Martinez Property",
        address: "2345 Pine Road, Springfield, IL 62703",
        phone: "(217) 555-0789",
        squareFootage: 3500,
        price: 35,
        isHilly: false,
        hasFencing: false,
        hasObstacles: false,
        frequency: "biweekly",
        notes: "",
      },
      {
        id: "4",
        name: "Williams Home",
        address: "8901 Elm Court, Springfield, IL 62704",
        phone: "(217) 555-0234",
        email: "twilliams@email.com",
        squareFootage: 7500,
        price: 55,
        isHilly: false,
        hasFencing: true,
        hasObstacles: true,
        frequency: "weekly",
        notes:
          "Pool equipment in backyard. Please be careful around it.",
      },
      {
        id: "5",
        name: "Brown Residence",
        address: "3456 Cedar Lane, Springfield, IL 62705",
        phone: "(217) 555-0567",
        squareFootage: 4200,
        price: 40,
        isHilly: true,
        hasFencing: false,
        hasObstacles: false,
        frequency: "weekly",
        notes: "Steep slope in front yard - use caution.",
      },
      {
        id: "6",
        name: "Davis Property",
        address: "6789 Birch Drive, Springfield, IL 62706",
        phone: "(217) 555-0890",
        email: "ldavis@email.com",
        squareFootage: 6000,
        price: 48,
        isHilly: false,
        hasFencing: true,
        hasObstacles: false,
        frequency: "weekly",
        notes: "",
      },
      {
        id: "7",
        name: "Miller Estate",
        address: "4567 Willow Way, Springfield, IL 62707",
        phone: "(217) 555-0345",
        squareFootage: 15000,
        price: 120,
        isHilly: true,
        hasFencing: true,
        hasObstacles: true,
        frequency: "weekly",
        notes:
          "Large estate. Enter through side gate. Client prefers service between 8-10 AM.",
      },
      {
        id: "8",
        name: "Garcia Home",
        address: "7890 Spruce Street, Springfield, IL 62708",
        phone: "(217) 555-0678",
        email: "garcia.family@email.com",
        squareFootage: 4500,
        price: 42,
        isHilly: false,
        hasFencing: false,
        hasObstacles: true,
        frequency: "biweekly",
        notes: "Lots of garden decorations - trim carefully.",
      },
      {
        id: "9",
        name: "Anderson Property",
        address: "2109 Hickory Place, Springfield, IL 62709",
        phone: "(217) 555-0901",
        squareFootage: 5500,
        price: 50,
        isHilly: false,
        hasFencing: true,
        hasObstacles: false,
        frequency: "weekly",
        notes: "",
      },
      {
        id: "10",
        name: "Taylor Residence",
        address: "3210 Walnut Boulevard, Springfield, IL 62710",
        phone: "(217) 555-0123",
        email: "ktaylor@email.com",
        squareFootage: 8000,
        price: 65,
        isHilly: true,
        hasFencing: false,
        hasObstacles: true,
        frequency: "weekly",
        notes:
          "Hilly backyard. Client leaves payment under doormat.",
      },
    ];
  });

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 pb-20 md:pb-0">
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