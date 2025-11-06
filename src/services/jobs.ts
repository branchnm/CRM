import { supabase } from "../lib/supabase";
import type { Job } from "../App";

/**
 * Get the current authenticated user's ID
 */
async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.id;
}

export async function fetchJobs(date?: string): Promise<Job[]> {
  // Debug: Check who is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  console.log('🔐 Fetching jobs for user:', user?.email, 'ID:', user?.id);
  
  // RLS policies will automatically filter by user_id
  let query = supabase.from("jobs").select("*");
  if (date) query = query.eq("date", date);
  const { data, error } = await query.order("date", { ascending: true });
  if (error) throw new Error(`Failed to fetch jobs: ${error.message}`);
  
  console.log('📊 Fetched jobs:', data?.length || 0, 'records');
  console.log('🔍 First job user_id:', data?.[0]?.user_id);
  
  return (data || []).map((row: any) => ({
    id: row.id,
    customerId: row.customer_id,
    date: row.date,
    scheduledTime: row.scheduled_time || undefined,
    startTime: row.start_time || undefined,
    endTime: row.end_time || undefined,
    status: row.status,
    totalTime: row.total_time || undefined,
    mowTime: row.mow_time || undefined,
    trimTime: row.trim_time || undefined,
    edgeTime: row.edge_time || undefined,
    blowTime: row.blow_time || undefined,
    driveTime: row.drive_time || undefined,
    notes: row.notes || undefined,
    photoUrls: row.photo_urls || undefined,
    messagesSent: row.messages_sent || undefined,
    order: row.order || undefined,
  }));
}

export async function upsertJob(job: Omit<Job, "id"> & { id?: string }): Promise<Job> {
  const userId = await getCurrentUserId();
  
  const db = {
    id: job.id,
    user_id: userId, // Add user_id
    customer_id: job.customerId,
    date: job.date,
    scheduled_time: job.scheduledTime || null,
    start_time: job.startTime || null,
    end_time: job.endTime || null,
    status: job.status,
    total_time: job.totalTime || null,
    mow_time: job.mowTime || null,
    trim_time: job.trimTime || null,
    edge_time: job.edgeTime || null,
    blow_time: job.blowTime || null,
    drive_time: job.driveTime || null,
    notes: job.notes || null,
    photo_urls: job.photoUrls || null,
    messages_sent: job.messagesSent || null,
    order: job.order || null,
  };
  const { data, error } = await supabase
    .from("jobs")
    .upsert(db, { onConflict: "id" })
    .select()
    .single();
  if (error) throw new Error(`Failed to upsert job: ${error.message}`);
  return {
    id: data.id,
    customerId: data.customer_id,
    date: data.date,
    scheduledTime: data.scheduled_time || undefined,
    startTime: data.start_time || undefined,
    endTime: data.end_time || undefined,
    status: data.status,
    totalTime: data.total_time || undefined,
    mowTime: data.mow_time || undefined,
    trimTime: data.trim_time || undefined,
    edgeTime: data.edge_time || undefined,
    blowTime: data.blow_time || undefined,
    driveTime: data.drive_time || undefined,
    notes: data.notes || undefined,
    photoUrls: data.photo_urls || undefined,
    messagesSent: data.messages_sent || undefined,
  } as Job;
}

export async function addJob(job: Omit<Job, "id">): Promise<Job> {
  const userId = await getCurrentUserId();
  
  const db = {
    user_id: userId, // Add user_id
    customer_id: job.customerId,
    date: job.date,
    scheduled_time: job.scheduledTime || null,
    start_time: job.startTime || null,
    end_time: job.endTime || null,
    status: job.status,
    total_time: job.totalTime || null,
    mow_time: job.mowTime || null,
    trim_time: job.trimTime || null,
    edge_time: job.edgeTime || null,
    blow_time: job.blowTime || null,
    drive_time: job.driveTime || null,
    notes: job.notes || null,
    photo_urls: job.photoUrls || null,
    messages_sent: job.messagesSent || null,
    order: job.order || null, // Include order field
  };
  const { data, error } = await supabase
    .from("jobs")
    .insert([db])
    .select()
    .single();
  if (error) throw new Error(`Failed to add job: ${error.message}`);
  return {
    id: data.id,
    customerId: data.customer_id,
    date: data.date,
    scheduledTime: data.scheduled_time || undefined,
    startTime: data.start_time || undefined,
    endTime: data.end_time || undefined,
    status: data.status,
    totalTime: data.total_time || undefined,
    mowTime: data.mow_time || undefined,
    trimTime: data.trim_time || undefined,
    edgeTime: data.edge_time || undefined,
    blowTime: data.blow_time || undefined,
    driveTime: data.drive_time || undefined,
    notes: data.notes || undefined,
    photoUrls: data.photo_urls || undefined,
    messagesSent: data.messages_sent || undefined,
    order: data.order || undefined, // Return order field
  } as Job;
}

export async function updateJob(job: Job): Promise<Job> {
  const userId = await getCurrentUserId();
  
  const db = {
    user_id: userId, // Add user_id
    customer_id: job.customerId,
    date: job.date,
    scheduled_time: job.scheduledTime || null,
    start_time: job.startTime || null,
    end_time: job.endTime || null,
    status: job.status,
    total_time: job.totalTime || null,
    mow_time: job.mowTime || null,
    trim_time: job.trimTime || null,
    edge_time: job.edgeTime || null,
    blow_time: job.blowTime || null,
    drive_time: job.driveTime || null,
    notes: job.notes || null,
    photo_urls: job.photoUrls || null,
    messages_sent: job.messagesSent || null,
    order: job.order || null, // CRITICAL: Include order field!
  };
  const { data, error } = await supabase
    .from("jobs")
    .update(db)
    .eq("id", job.id)
    .select()
    .single();
  if (error) throw new Error(`Failed to update job: ${error.message}`);
  return {
    id: data.id,
    customerId: data.customer_id,
    date: data.date,
    scheduledTime: data.scheduled_time || undefined,
    startTime: data.start_time || undefined,
    endTime: data.end_time || undefined,
    status: data.status,
    totalTime: data.total_time || undefined,
    mowTime: data.mow_time || undefined,
    trimTime: data.trim_time || undefined,
    edgeTime: data.edge_time || undefined,
    blowTime: data.blow_time || undefined,
    driveTime: data.drive_time || undefined,
    notes: data.notes || undefined,
    photoUrls: data.photo_urls || undefined,
    messagesSent: data.messages_sent || undefined,
    order: data.order || undefined, // CRITICAL: Return order field!
  } as Job;
}

export async function deleteJob(id: string): Promise<void> {
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete job: ${error.message}`);
}
