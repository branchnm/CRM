import { supabase } from "../lib/supabase";

export interface SMSProvider {
  sendSMS(to: string, message: string): Promise<boolean>;
}

// Utility function to validate and format phone numbers
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Add +1 if it's a 10-digit US number
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // Add + if it doesn't have one and is 11+ digits
  if (digits.length >= 11 && !phone.startsWith('+')) {
    return `+${digits}`;
  }
  
  return phone;
}

// Twilio SMS implementation
export class TwilioSMS implements SMSProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${this.accountSid}:${this.authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: this.fromNumber,
          Body: message,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      return false;
    }
  }
}

// Supabase Edge Function SMS (recommended for production)
export class SupabaseSMS implements SMSProvider {
  async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const formattedPhone = formatPhoneNumber(to);
      console.log(`📱 Sending SMS via Supabase to ${formattedPhone}: ${message}`);
      
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: formattedPhone, message }
      });
      
      if (error) {
        console.error('Supabase function error:', error);
        return false;
      }
      
      console.log('SMS response:', data);
      return data?.success || false;
    } catch (error) {
      console.error('Failed to send SMS via Supabase:', error);
      return false;
    }
  }
}

// Mock SMS for development/testing
export class MockSMS implements SMSProvider {
  async sendSMS(to: string, message: string): Promise<boolean> {
    console.log(`📱 Mock SMS to ${to}: ${message}`);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true; // Always succeed in development
  }
}

// SMS service factory
export function createSMSService(): SMSProvider {
  // Temporarily use MockSMS while setting up Twilio phone number
  const isDevelopment = import.meta.env.DEV;
  if (isDevelopment) {
    return new MockSMS();
  }

  // Use Supabase SMS for production
  return new SupabaseSMS();

  // Direct Twilio option (if you prefer not to use Edge Function)
  // const twilioSid = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
  // const twilioToken = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
  // const twilioNumber = import.meta.env.VITE_TWILIO_PHONE_NUMBER;
  // if (twilioSid && twilioToken && twilioNumber) {
  //   return new TwilioSMS(twilioSid, twilioToken, twilioNumber);
  // }
}

export const smsService = createSMSService();