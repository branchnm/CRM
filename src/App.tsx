import { useState, useEffect } from "react";
import { DailySchedule } from "./components/DailySchedule";
import { InsightsDashboard } from "./components/InsightsDashboard";
import { CustomerView } from "./components/CustomerView";
import { Settings } from "./components/Settings";
import { CalendarView } from "./components/CalendarView";
import AuthPage from "./components/AuthPage";
import {
  Calendar,
  TrendingUp,
  Users,
  Settings as SettingsIcon,
  CalendarDays,
  CloudSun,
  LogOut,
} from "lucide-react";
import { fetchCustomers } from "./services/customers";
import { fetchJobs } from "./services/jobs";
import { getCurrentUser, onAuthStateChange, signOut } from "./services/auth";
import type { User } from "@supabase/supabase-js";
import { Button } from "./components/ui/button";

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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("schedule");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Check auth state on mount and listen for changes
  useEffect(() => {
    // Check current user
    getCurrentUser().then((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    // Listen for auth changes
    const subscription = onAuthStateChange((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      // Reload customers when user logs in
      if (currentUser) {
        loadCustomers();
      } else {
        setCustomers([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle logout
  const handleLogout = async () => {
    await signOut();
    setCustomers([]);
    setActiveTab("schedule");
  };

  // Handle scroll to show/hide bottom navigation
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY < lastScrollY) {
        // Scrolling up
        setShowBottomNav(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down and past threshold
        setShowBottomNav(false);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Load customers from Supabase
  const loadCustomers = async () => {
    if (!user) return;
    
    try {
      const data = await fetchCustomers();
      setCustomers(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load customers:', error);
      setLoading(false);
    }
  };

  // Load customers when user is authenticated
  useEffect(() => {
    if (user) {
      loadCustomers();
    }
  }, [user]);

  // Expose a refresh function to children
  const refreshCustomers = async () => {
    if (!user) return;
    
    try {
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to refresh customers:', error);
    }
  };

  const [jobs, setJobs] = useState<Job[]>([]);

  // Load jobs from Supabase when user is authenticated
  useEffect(() => {
    if (!user) return;
    
    const loadJobs = async () => {
      try {
        const data = await fetchJobs();
        setJobs(data);
      } catch (error) {
        console.error('Failed to load jobs:', error);
      }
    };
    loadJobs();
  }, [user]);

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
    { id: "schedule", label: "Today", icon: CloudSun },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "customers", label: "Customers", icon: Users },
    { id: "insights", label: "Insights", icon: TrendingUp },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-yellow-50 flex items-center justify-center">
        <div className="text-blue-800 text-xl">Loading...</div>
      </div>
    );
  }

  // Show auth page if not logged in
  if (!user) {
    return <AuthPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-yellow-50 flex items-center justify-center">
        <div className="text-blue-800 text-xl">Loading customers...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-yellow-50 pb-20 md:pb-0">
      <div className="container mx-auto p-2 sm:p-4 md:p-8 max-w-7xl">
        {/* Header - Logo style with Logout */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="flex-1"></div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-blue-700 to-blue-800 uppercase tracking-wider drop-shadow-sm">
              Job Flow
            </h1>
            <div className="flex-1 flex justify-end">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                className="text-blue-600 hover:text-blue-700"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
      <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden transition-transform duration-300 z-50 safe-area-inset ${
        showBottomNav ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="flex justify-around items-center px-2 py-1 max-w-full overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-2 px-3 min-w-[60px] shrink-0 ${
                activeTab === item.id
                  ? "text-blue-600"
                  : "text-gray-500"
              }`}
            >
              <item.icon className="h-5 w-5 mb-0.5" />
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:block fixed top-8 right-8 z-100">
        <div className="flex gap-2 bg-white rounded-lg p-2 shadow-lg">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === item.id
                  ? "bg-blue-100 text-blue-700"
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