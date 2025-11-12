import { supabase } from "../lib/supabase";
import type { Customer } from "../App";
import { calculateNextCutDate } from "../utils/dateHelpers";

// Demo user ID - fixed UUID for all demo mode data
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

// Check if demo mode is enabled
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Get the current user's ID (or demo user ID if in demo mode)
 */
async function getCurrentUserId(): Promise<string> {
  // In demo mode, always use the special demo user ID
  if (DEMO_MODE) {
    return DEMO_USER_ID;
  }
  
  // In normal mode, require authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.id;
}

/**
 * Delete a customer from Supabase
 */
export async function deleteCustomer(customerId: string): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId);

  if (error) {
    console.error("Error deleting customer:", error);
    throw new Error(`Failed to delete customer: ${error.message}`);
  }
}

/**
 * Delete ALL customers from Supabase (use with caution!)
 */
export async function deleteAllCustomers(): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all rows

  if (error) {
    console.error("Error deleting all customers:", error);
    throw new Error(`Failed to delete all customers: ${error.message}`);
  }
}

/**
 * Fetch all customers from Supabase (filtered by current user or demo user)
 */
export async function fetchCustomers(): Promise<Customer[]> {
  const userId = await getCurrentUserId();
  
  // Debug: Check who is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  console.log('🔐 Fetching customers for user:', DEMO_MODE ? 'DEMO MODE' : user?.email, 'ID:', userId);
  
  // Explicitly filter by user_id to ensure proper isolation
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", userId) // Explicit filter by user_id
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching customers:", error);
    throw new Error(`Failed to fetch customers: ${error.message}`);
  }

  console.log('📊 Fetched customers:', data?.length || 0, 'records');
  if (data && data.length > 0) {
    console.log('🔍 First customer user_id:', data[0].user_id);
  }

  // Helper: format Date to YYYY-MM-DD
  const toYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper: next date for a given dayOfWeek (0=Sun..6=Sat)
  const nextForDayOfWeek = (dow: number | null | undefined): string | undefined => {
    if (dow === null || dow === undefined) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delta = (dow - today.getDay() + 7) % 7; // 0 means today
    const next = new Date(today);
    next.setDate(today.getDate() + delta);
    return toYMD(next);
  };

  // Convert database rows (snake_case) to app format (camelCase)
  return data.map((row: any) => {
    const lastCut: string | undefined = row.last_cut_date || undefined;
    const fromDBNext: string | undefined = row.next_cut_date || undefined;
    // Fallbacks: compute next if missing
    const computedFromLast = calculateNextCutDate(lastCut, row.frequency as Customer["frequency"]);
    const computedFromDow = nextForDayOfWeek(row.day_of_week);
    const resolvedNext = fromDBNext || computedFromLast || computedFromDow;

    return {
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      squareFootage: row.square_footage,
      price: row.price,
      isHilly: row.is_hilly,
      hasFencing: row.has_fencing,
      hasObstacles: row.has_obstacles,
      frequency: row.frequency,
      dayOfWeek: row.day_of_week,
      notes: row.notes,
      lastCutDate: lastCut,
      nextCutDate: resolvedNext,
      status: row.status || "incomplete",
      group: row.group || undefined, // Group name for nearby property clustering
    } as Customer;
  });
}

/**
 * Add a new customer to Supabase
 */
export async function addCustomer(customer: Omit<Customer, "id">): Promise<Customer> {
  const userId = await getCurrentUserId();
  
  // Convert from camelCase to snake_case for database
  const dbCustomer = {
    user_id: userId, // Add user_id
    name: customer.name,
    address: customer.address,
    phone: customer.phone,
    email: customer.email || null,
    square_footage: customer.squareFootage,
    price: customer.price,
    is_hilly: customer.isHilly,
    has_fencing: customer.hasFencing,
    has_obstacles: customer.hasObstacles,
    frequency: customer.frequency,
    day_of_week: customer.dayOfWeek || null,
    notes: customer.notes || "",
    last_cut_date: customer.lastCutDate || null,
    next_cut_date: customer.nextCutDate || null,
    status: customer.status || "incomplete",
    group: customer.group || null, // Group name for nearby property clustering
  };

  const { data, error } = await supabase
    .from("customers")
    .insert([dbCustomer])
    .select()
    .single();

  if (error) {
    console.error("Error adding customer:", error);
    throw new Error(`Failed to add customer: ${error.message}`);
  }

  // Convert back to camelCase
  return {
    id: data.id,
    name: data.name,
    address: data.address,
    phone: data.phone,
    email: data.email,
    squareFootage: data.square_footage,
    price: data.price,
    isHilly: data.is_hilly,
    hasFencing: data.has_fencing,
    hasObstacles: data.has_obstacles,
    frequency: data.frequency,
    dayOfWeek: data.day_of_week,
    notes: data.notes,
    lastCutDate: data.last_cut_date,
    nextCutDate: data.next_cut_date,
    status: data.status || "incomplete",
    group: data.group || undefined,
  };
}

/**
 * Update an existing customer in Supabase
 */
export async function updateCustomer(customer: Customer): Promise<Customer> {
  // Convert from camelCase to snake_case for database
  const dbCustomer = {
    name: customer.name,
    address: customer.address,
    phone: customer.phone,
    email: customer.email || null,
    square_footage: customer.squareFootage,
    price: customer.price,
    is_hilly: customer.isHilly,
    has_fencing: customer.hasFencing,
    has_obstacles: customer.hasObstacles,
    frequency: customer.frequency,
    day_of_week: customer.dayOfWeek || null,
    notes: customer.notes || "",
    last_cut_date: customer.lastCutDate || null,
    next_cut_date: customer.nextCutDate || null,
    status: customer.status || "incomplete",
    group: customer.group || null,
  };

  const { data, error } = await supabase
    .from("customers")
    .update(dbCustomer)
    .eq("id", customer.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating customer:", error);
    throw new Error(`Failed to update customer: ${error.message}`);
  }

  // Convert back to camelCase
  return {
    id: data.id,
    name: data.name,
    address: data.address,
    phone: data.phone,
    email: data.email,
    squareFootage: data.square_footage,
    price: data.price,
    isHilly: data.is_hilly,
    hasFencing: data.has_fencing,
    hasObstacles: data.has_obstacles,
    frequency: data.frequency,
    dayOfWeek: data.day_of_week,
    notes: data.notes,
    lastCutDate: data.last_cut_date,
    nextCutDate: data.next_cut_date,
    status: data.status || "incomplete",
    group: data.group || undefined,
  };
}
