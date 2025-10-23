import { supabase } from "../lib/supabase";
import type { Customer } from "../App";

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
 * Fetch all customers from Supabase
 */
export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching customers:", error);
    throw new Error(`Failed to fetch customers: ${error.message}`);
  }

  // Convert database rows (snake_case) to app format (camelCase)
  return data.map((row: any) => ({
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
    lastCutDate: row.last_cut_date,
    nextCutDate: row.next_cut_date,
  }));
}

/**
 * Add a new customer to Supabase
 */
export async function addCustomer(customer: Omit<Customer, "id">): Promise<Customer> {
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
  };
}
