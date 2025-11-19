import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../utils/supabase/info";

const supabaseUrl = `https://${projectId}.supabase.co`;

// Create Supabase client with proper auth configuration
export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: (url, options = {}) => {
      console.log('🌐 Supabase fetch to:', url);
      return fetch(url, {
        ...options,
        // Add headers to help with CORS/SSL issues
        headers: {
          ...options.headers,
        }
      }).catch(err => {
        console.error('❌ Supabase fetch error:', err);
        throw err;
      });
    }
  }
});
