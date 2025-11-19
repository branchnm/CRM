import { supabase } from "../lib/supabase";
import type { CustomerGroup } from "../App";
import { 
  isOfflineMode, 
  getOfflineGroups, 
  saveOfflineGroup, 
  deleteOfflineGroup 
} from "./offlineStorage";

// Demo user ID - fixed UUID for all demo mode data
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

// Check if demo mode is enabled
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Get the current user's ID (or demo user ID if in demo mode)
 */
async function getCurrentUserId(): Promise<string> {
  if (DEMO_MODE) {
    return DEMO_USER_ID;
  }
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.id;
}

/**
 * Fetch all customer groups for current user
 */
export async function fetchCustomerGroups(): Promise<CustomerGroup[]> {
  if (isOfflineMode()) {
    console.log('📴 OFFLINE MODE: Fetching groups from localStorage');
    return getOfflineGroups();
  }
  
  const userId = await getCurrentUserId();
  
  const { data: { user } } = await supabase.auth.getUser();
  console.log('🔐 Fetching customer groups for user:', DEMO_MODE ? 'DEMO MODE' : user?.email, 'ID:', userId);
  
  const { data, error } = await supabase
    .from("customer_groups")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching customer groups:", error);
    throw new Error(`Failed to fetch customer groups: ${error.message}`);
  }

  console.log('📊 Fetched customer groups:', data?.length || 0, 'records');

  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    workTimeMinutes: row.work_time_minutes,
    customerIds: row.customer_ids || [],
    color: row.color || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Create a new customer group
 */
export async function createCustomerGroup(
  group: Omit<CustomerGroup, "id" | "createdAt" | "updatedAt">
): Promise<CustomerGroup> {
  if (isOfflineMode()) {
    const newGroup: CustomerGroup = {
      ...group,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    console.log('📴 OFFLINE MODE: Creating group in localStorage');
    return saveOfflineGroup(newGroup);
  }
  
  const userId = await getCurrentUserId();

  const dbGroup = {
    user_id: userId,
    name: group.name,
    work_time_minutes: group.workTimeMinutes,
    customer_ids: group.customerIds || [],
    color: group.color || null,
    notes: group.notes || null,
  };

  const { data, error } = await supabase
    .from("customer_groups")
    .insert([dbGroup])
    .select()
    .single();

  if (error) {
    console.error("Error creating customer group:", error);
    throw new Error(`Failed to create customer group: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    workTimeMinutes: data.work_time_minutes,
    customerIds: data.customer_ids || [],
    color: data.color || undefined,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update an existing customer group
 */
export async function updateCustomerGroup(group: CustomerGroup): Promise<CustomerGroup> {
  if (isOfflineMode()) {
    const updatedGroup = {
      ...group,
      updatedAt: new Date().toISOString()
    };
    console.log('📴 OFFLINE MODE: Updating group in localStorage');
    return saveOfflineGroup(updatedGroup);
  }
  
  const dbGroup = {
    name: group.name,
    work_time_minutes: group.workTimeMinutes,
    customer_ids: group.customerIds || [],
    color: group.color || null,
    notes: group.notes || null,
  };

  const { data, error } = await supabase
    .from("customer_groups")
    .update(dbGroup)
    .eq("id", group.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating customer group:", error);
    throw new Error(`Failed to update customer group: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    workTimeMinutes: data.work_time_minutes,
    customerIds: data.customer_ids || [],
    color: data.color || undefined,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Delete a customer group
 */
export async function deleteCustomerGroup(groupId: string): Promise<void> {
  if (isOfflineMode()) {
    console.log('📴 OFFLINE MODE: Deleting group from localStorage');
    deleteOfflineGroup(groupId);
    return;
  }
  
  const { error } = await supabase
    .from("customer_groups")
    .delete()
    .eq("id", groupId);

  if (error) {
    console.error("Error deleting customer group:", error);
    throw new Error(`Failed to delete customer group: ${error.message}`);
  }
}

/**
 * Add a customer to a group
 */
export async function addCustomerToGroup(groupId: string, customerId: string): Promise<CustomerGroup> {
  // First, fetch the current group
  const { data: currentGroup, error: fetchError } = await supabase
    .from("customer_groups")
    .select("*")
    .eq("id", groupId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch group: ${fetchError.message}`);
  }

  // Add customer ID to the array if not already present
  const customerIds = currentGroup.customer_ids || [];
  if (!customerIds.includes(customerId)) {
    customerIds.push(customerId);
  }

  // Update the group
  const { data, error } = await supabase
    .from("customer_groups")
    .update({ customer_ids: customerIds })
    .eq("id", groupId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add customer to group: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    workTimeMinutes: data.work_time_minutes,
    customerIds: data.customer_ids || [],
    color: data.color || undefined,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Remove a customer from a group
 */
export async function removeCustomerFromGroup(groupId: string, customerId: string): Promise<CustomerGroup> {
  // First, fetch the current group
  const { data: currentGroup, error: fetchError } = await supabase
    .from("customer_groups")
    .select("*")
    .eq("id", groupId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch group: ${fetchError.message}`);
  }

  // Remove customer ID from the array
  const customerIds = (currentGroup.customer_ids || []).filter((id: string) => id !== customerId);

  // Update the group
  const { data, error } = await supabase
    .from("customer_groups")
    .update({ customer_ids: customerIds })
    .eq("id", groupId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to remove customer from group: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name,
    workTimeMinutes: data.work_time_minutes,
    customerIds: data.customer_ids || [],
    color: data.color || undefined,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
