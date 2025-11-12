import { useState, useEffect, useRef } from "react";
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
  MapPin,
  Route,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { fetchCustomers } from "./services/customers";
import { fetchJobs } from "./services/jobs";
import { fetchCustomerGroups } from "./services/groups";
import { getCurrentUser, onAuthStateChange, signOut } from "./services/auth";
import type { User } from "@supabase/supabase-js";
import { Button } from "./components/ui/button";

// Check if demo mode is enabled via environment variable
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export interface CustomerGroup {
  id: string;
  name: string;
  workTimeMinutes: number; // Total work time for all properties in group
  customerIds: string[]; // Array of customer IDs in this group
  color?: string; // Optional custom color for visual identification
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

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
  groupId?: string; // Reference to CustomerGroup.id
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
  const [authLoading, setAuthLoading] = useState(!DEMO_MODE); // Skip auth loading in demo mode
  const [activeTab, setActiveTab] = useState("schedule");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]); // NEW: Customer groups
  const [loading, setLoading] = useState(true);
  const [showBottomNav, setShowBottomNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [locationZipCode, setLocationZipCode] = useState<string>(() => {
    // Load location from localStorage on mount
    const savedLocationName = localStorage.getItem('weatherLocationName');
    if (savedLocationName) {
      const zipMatch = savedLocationName.match(/\b\d{5}(?:-\d{4})?\b/);
      return zipMatch ? zipMatch[0] : '';
    }
    return '';
  });
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [tempLocationName, setTempLocationName] = useState<string>(''); // Store location before editing
  const [optimizationStatus, setOptimizationStatus] = useState<'idle' | 'optimizing' | 'optimized'>('idle');
  const [hasJobChanges, setHasJobChanges] = useState(false);
  const scrollToTodayRef = useRef<(() => void) | null>(null);
  const resetToTodayRef = useRef<(() => void) | null>(null);

  // Don't auto-hide optimize button - keep it showing "Optimized" until jobs change
  // The optimization status is now controlled by job changes detection in DailySchedule

  // Check auth state on mount and listen for changes (skip in demo mode)
  useEffect(() => {
    if (DEMO_MODE) {
      console.log('🎭 Demo Mode: Authentication bypassed');
      setAuthLoading(false);
      return;
    }

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
    if (DEMO_MODE) return; // Can't logout in demo mode
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
    // In demo mode, skip auth check
    if (!DEMO_MODE && !user) return;
    
    try {
      const data = await fetchCustomers();
      setCustomers(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load customers:', error);
      setLoading(false);
    }
  };

  // Load customer groups from Supabase
  const loadCustomerGroups = async () => {
    // In demo mode, skip auth check
    if (!DEMO_MODE && !user) return;
    
    try {
      const data = await fetchCustomerGroups();
      setCustomerGroups(data);
    } catch (error) {
      console.error('Failed to load customer groups:', error);
    }
  };

  // Load customers and groups on mount (or when user changes)
  useEffect(() => {
    if (DEMO_MODE || user) {
      loadCustomers();
      loadCustomerGroups();
    }
  }, [user]); // Keep user dependency for auth mode

  // Expose a refresh function to children
  const refreshCustomers = async () => {
    // In demo mode, skip auth check
    if (!DEMO_MODE && !user) return;
    
    try {
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to refresh customers:', error);
    }
  };

  // Refresh customer groups
  const refreshCustomerGroups = async () => {
    // In demo mode, skip auth check
    if (!DEMO_MODE && !user) return;
    
    try {
      const data = await fetchCustomerGroups();
      setCustomerGroups(data);
    } catch (error) {
      console.error('Failed to refresh customer groups:', error);
    }
  };

  const [jobs, setJobs] = useState<Job[]>([]);

  // Load jobs from Supabase
  useEffect(() => {
    // In demo mode, skip auth check
    if (!DEMO_MODE && !user) return;
    
    const loadJobs = async () => {
      try {
        const data = await fetchJobs();
        setJobs(data);
      } catch (error) {
        console.error('Failed to load jobs:', error);
      }
    };
    loadJobs();
  }, [user]); // Keep user dependency for both modes

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

  // Show loading state while checking auth (skip in demo mode)
  if (!DEMO_MODE && authLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-yellow-50 flex items-center justify-center">
        <div className="text-blue-800 text-xl">Loading...</div>
      </div>
    );
  }

  // Show auth page if not logged in (skip in demo mode)
  if (!DEMO_MODE && !user) {
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
      {/* Desktop Top Navigation Bar - Fixed and full width with vh-based height */}
      <div className="hidden md:block fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm" style={{ height: '5vh', minHeight: '50px' }}>
        <div className="w-full px-4 h-full flex items-center">
          <div className="flex items-center justify-center gap-4 xl:gap-6 w-full">
            {/* Logo - Left */}
            <h1 className="text-lg xl:text-xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-blue-700 to-blue-800 uppercase tracking-wider whitespace-nowrap">
              Job Flow
            </h1>
            
            {/* Address - Left of tabs */}
            <button
              onClick={() => {
                // Store current location before editing
                const savedLocationName = localStorage.getItem('weatherLocationName');
                setTempLocationName(savedLocationName || '');
                setIsEditingAddress(true);
              }}
              className="flex items-center gap-2 px-2 xl:px-3 py-2 text-xs xl:text-sm bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              title="Click to change location"
            >
              <MapPin className="h-3 w-3 xl:h-4 xl:w-4 text-blue-600 shrink-0" />
              <span className="font-medium text-blue-900">{locationZipCode || 'Set Location'}</span>
            </button>
            
            {/* Tab Navigation - Center */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1 xl:gap-2 px-2 xl:px-4 py-2 rounded-md transition-colors ${
                    activeTab === item.id
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <item.icon className="h-3 w-3 xl:h-4 xl:w-4 shrink-0" />
                  <span className="font-medium text-xs xl:text-sm hidden lg:inline">{item.label}</span>
                </button>
              ))}
            </div>

            {/* User info and logout - Right (hide in demo mode) */}
            {!DEMO_MODE && (
              <div className="flex items-center gap-2 xl:gap-3">
                <span className="text-xs xl:text-sm text-gray-600 hidden xl:inline">{user?.email || 'Guest'}</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 px-2 xl:px-4"
                >
                  <LogOut className="h-3 w-3 xl:h-4 xl:w-4 xl:mr-2" />
                  <span className="hidden xl:inline text-xs xl:text-sm">Logout</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub Navigation Bar - Only visible when Schedule tab is active on desktop */}
      {activeTab === "schedule" && (
        <div className="hidden md:block fixed z-40 left-0 right-0 bg-linear-to-b from-blue-50 to-white border-b border-blue-100 shadow-sm" style={{ top: 'max(5vh, 50px)', height: '3.5vh', minHeight: '40px' }}>
          <div className="w-full h-full flex items-center justify-center gap-3 px-4">
            {/* Today Button */}
            <Button
              onClick={() => {
                scrollToTodayRef.current?.();
                resetToTodayRef.current?.();
              }}
              size="sm"
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 px-3"
            >
              <Calendar className="h-4 w-4 mr-2 shrink-0" />
              <span className="text-sm">Today</span>
            </Button>

            {/* Optimize Button - Shows when there are jobs */}
            {jobs.length > 0 && (
              <Button
                onClick={() => {
                  // This will be handled by DailySchedule's optimize handler
                  const event = new CustomEvent('optimizeRoute');
                  window.dispatchEvent(event);
                }}
                disabled={optimizationStatus === 'optimizing'}
                size="sm"
                className="shrink-0 transition-colors bg-blue-600 hover:bg-blue-700 px-3"
              >
                {optimizationStatus === 'optimizing' && <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />}
                {optimizationStatus === 'optimized' && <CheckCircle className="h-4 w-4 mr-2 shrink-0" />}
                {optimizationStatus === 'idle' && <Route className="h-4 w-4 mr-2 shrink-0" />}
                <span className="text-sm">
                  {optimizationStatus === 'optimizing' && 'Optimizing'}
                  {optimizationStatus === 'optimized' && 'Optimized'}
                  {optimizationStatus === 'idle' && 'Optimize'}
                </span>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="container mx-auto md:px-8" style={{ 
        paddingTop: activeTab === "schedule" ? '0' : 'max(5vh, 50px)', // No top padding on mobile schedule
        paddingLeft: activeTab === "schedule" ? '0' : '0.5rem',
        paddingRight: activeTab === "schedule" ? '0' : '0.5rem',
        paddingBottom: '0.5rem'
      }}>
        {/* Desktop-only top padding for schedule tab */}
        {activeTab === "schedule" && <div className="hidden md:block" style={{ height: '2rem' }}></div>}
        {/* Mobile Header - Logo style with Logout (only on settings tab) */}
        <div className="md:mb-6 md:hidden" style={{ 
          marginBottom: activeTab === "schedule" ? 'clamp(0.25rem, 1vh, 0.5rem)' : '1rem',
          marginTop: activeTab === "schedule" ? '0' : '0.5rem',
          paddingTop: activeTab === "schedule" ? 'clamp(0.25rem, 0.5vh, 0.5rem)' : '0',
          paddingLeft: activeTab === "schedule" ? 'clamp(0.5rem, 2vw, 1rem)' : '0.5rem',
          paddingRight: activeTab === "schedule" ? 'clamp(0.5rem, 2vw, 1rem)' : '0.5rem'
        }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'clamp(0.25rem, 0.5vh, 0.5rem)' }}>
            <div className="flex-1"></div>
            <h1 className="font-black text-transparent bg-clip-text bg-linear-to-r from-blue-600 via-blue-700 to-blue-800 uppercase tracking-wider drop-shadow-sm" style={{ 
              fontSize: 'clamp(1rem, 4vh, 2rem)',
              lineHeight: '1.2'
            }}>
              Job Flow
            </h1>
            <div className="flex-1 flex justify-end">
              {/* Show logout button in settings tab (hide in demo mode) */}
              {!DEMO_MODE && activeTab === "settings" && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="mb-6">
          {activeTab === "schedule" && (
            <DailySchedule
              customers={customers}
              customerGroups={customerGroups}
              jobs={jobs}
              equipment={equipment}
              onUpdateJobs={updateJobs}
              messageTemplates={messageTemplates}
              onRefreshCustomers={refreshCustomers}
              onRefreshJobs={refreshJobs}
              onLocationChange={(locationName: string, zipCode: string) => setLocationZipCode(zipCode)}
              onEditAddress={() => {
                const savedLocationName = localStorage.getItem('weatherLocationName');
                setTempLocationName(savedLocationName || '');
                setIsEditingAddress(true);
              }}
              onCancelEditAddress={() => {
                // Revert to previous location
                if (tempLocationName) {
                  localStorage.setItem('weatherLocationName', tempLocationName);
                  const zipMatch = tempLocationName.match(/\b\d{5}(?:-\d{4})?\b/);
                  setLocationZipCode(zipMatch ? zipMatch[0] : '');
                }
                setIsEditingAddress(false);
              }}
              onCloseAddressEditor={() => {
                // Close without reverting - location already saved
                setIsEditingAddress(false);
              }}
              isEditingAddress={isEditingAddress}
              optimizationStatus={optimizationStatus}
              onOptimizationStatusChange={setOptimizationStatus}
              onJobChangesDetected={setHasJobChanges}
              scrollToTodayRef={scrollToTodayRef}
              resetToTodayRef={resetToTodayRef}
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
              customerGroups={customerGroups}
              onUpdateCustomers={updateCustomers}
              onRefreshCustomers={refreshCustomers}
              onRefreshCustomerGroups={refreshCustomerGroups}
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
        {/* Today Button - Shows above tabs when on schedule */}
        {activeTab === "schedule" && (
          <div className="flex justify-center items-center border-b border-gray-100 bg-blue-50" style={{ 
            gap: 'max(0.5vw, 4px)', 
            padding: 'max(0.5vh, 3px) max(1vw, 6px)',
            minHeight: 'max(5vh, 35px)' // More aggressive scaling with minimum
          }}>
            {/* Location Button - Shows zipcode, opens location editor */}
            <Button
              onClick={() => setIsEditingAddress(true)}
              size="sm"
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-100 shrink-0"
              style={{ 
                fontSize: 'max(1.4vh, 10px)',
                padding: 'max(0.5vh, 3px) max(2vw, 8px)',
                maxHeight: 'max(4vh, 28px)',
                height: 'auto'
              }}
              title="Click to change location"
            >
              <MapPin style={{ width: 'max(1.8vh, 14px)', height: 'max(1.8vh, 14px)' }} className="shrink-0" />
              <span style={{ marginLeft: 'max(0.8vw, 4px)' }}>{locationZipCode || 'Set Location'}</span>
            </Button>
            
            <Button
              onClick={() => {
                scrollToTodayRef.current?.();
                resetToTodayRef.current?.();
              }}
              size="sm"
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-100 shrink-0"
              style={{ 
                fontSize: 'max(1.4vh, 10px)',
                padding: 'max(0.5vh, 3px) max(2vw, 8px)',
                maxHeight: 'max(4vh, 28px)',
                height: 'auto'
              }}
            >
              <Calendar style={{ width: 'max(1.8vh, 14px)', height: 'max(1.8vh, 14px)' }} className="shrink-0" />
              <span style={{ marginLeft: 'max(0.8vw, 4px)' }}>Today</span>
            </Button>
            {/* Optimize Button - Shows when there are jobs */}
            {jobs.length > 0 && (
              <Button
                onClick={() => {
                  const event = new CustomEvent('optimizeRoute');
                  window.dispatchEvent(event);
                }}
                disabled={optimizationStatus === 'optimizing'}
                size="sm"
                className="shrink-0 transition-colors bg-blue-600 hover:bg-blue-700"
                style={{ 
                  fontSize: 'max(1.4vh, 10px)',
                  padding: 'max(0.5vh, 3px) max(2vw, 8px)',
                  maxHeight: 'max(4vh, 28px)',
                  height: 'auto'
                }}
              >
                {optimizationStatus === 'optimizing' && <Loader2 style={{ width: 'max(1.8vh, 14px)', height: 'max(1.8vh, 14px)' }} className="animate-spin shrink-0" />}
                {optimizationStatus === 'optimized' && <CheckCircle style={{ width: 'max(1.8vh, 14px)', height: 'max(1.8vh, 14px)' }} className="shrink-0" />}
                {optimizationStatus === 'idle' && <Route style={{ width: 'max(1.8vh, 14px)', height: 'max(1.8vh, 14px)' }} className="shrink-0" />}
                <span style={{ marginLeft: 'max(0.8vw, 4px)' }}>
                  {optimizationStatus === 'optimizing' && 'Optimizing'}
                  {optimizationStatus === 'optimized' && 'Optimized'}
                  {optimizationStatus === 'idle' && 'Optimize'}
                </span>
              </Button>
            )}
          </div>
        )}
        
        <div className="flex justify-around items-center max-w-full overflow-x-auto" style={{ 
          padding: 'max(0.5vh, 3px) max(0.5vw, 4px)',
          minHeight: 'max(5vh, 40px)' // More responsive to height changes
        }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center shrink-0 ${
                activeTab === item.id
                  ? "text-blue-600"
                  : "text-gray-500"
              }`}
              style={{
                padding: 'max(0.5vh, 3px) max(1.5vw, 6px)',
                minWidth: 'max(12vw, 45px)',
                height: 'auto'
              }}
            >
              <item.icon style={{ 
                width: 'max(2.2vh, 18px)', 
                height: 'max(2.2vh, 18px)', 
                marginBottom: 'max(0.2vh, 2px)' 
              }} />
              <span style={{ 
                fontSize: 'max(1vh, 8px)', 
                lineHeight: '1.1',
                whiteSpace: 'nowrap'
              }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;