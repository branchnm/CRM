# Supabase SMS Setup Guide

## 1. Create Edge Function

In your Supabase project, create a new Edge Function:

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (get project ID from Supabase dashboard)
supabase link --project-ref YOUR_PROJECT_ID

# Create the SMS function
supabase functions new send-sms
```

## 2. Function Code

Replace the generated function with this code:

**supabase/functions/send-sms/index.ts:**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Choose your SMS provider (Twilio example)
async function sendViaTwilio(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')!

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: message,
    }),
  })

  return response.ok
}

// Alternative: AWS SNS (cheaper option)
async function sendViaSNS(to: string, message: string) {
  // AWS SNS implementation would go here
  // Requires AWS SDK for Deno
  return false // Placeholder
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, message } = await req.json()

    if (!to || !message) {
      throw new Error('Missing required fields: to, message')
    }

    // Choose provider (you can switch between them)
    const success = await sendViaTwilio(to, message)
    // const success = await sendViaSNS(to, message) // Alternative

    return new Response(
      JSON.stringify({ success, message: success ? 'SMS sent' : 'Failed to send SMS' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: success ? 200 : 500
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
```

## 3. Set Environment Variables

In Supabase Dashboard → Settings → Edge Functions → Environment Variables:

**For Twilio:**
- `TWILIO_ACCOUNT_SID`: Your Account SID
- `TWILIO_AUTH_TOKEN`: Your Auth Token  
- `TWILIO_FROM_NUMBER`: Your Twilio phone number (e.g., +1234567890)

**For AWS SNS (alternative):**
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret
- `AWS_REGION`: Your preferred region (e.g., us-east-1)

## 4. Deploy Function

```bash
# Deploy the function
supabase functions deploy send-sms

# Test it (optional)
supabase functions invoke send-sms --data '{"to":"+1234567890","message":"Test message"}'
```

## 5. Your App is Already Ready!

Your current app will automatically use the Supabase Edge Function because I already implemented the `SupabaseSMS` class in `src/services/sms.ts`. It will:

1. Try Twilio direct (if you have env vars in frontend) 
2. **Fall back to Supabase Edge Function** (which you're setting up)
3. Use MockSMS in development

## 6. Cost Optimization Tips

**For lowest cost:**
- Use AWS SNS via Edge Function (~$0.00645/SMS)
- Set up SMS rate limiting to prevent spam
- Consider SMS templates to reduce message length

**For easiest setup:**
- Use Twilio via Edge Function (~$0.0075/SMS)
- Twilio has better docs and error handling

## Security Benefits

✅ **API keys never exposed** to frontend  
✅ **Rate limiting** can be added to Edge Function  
✅ **Logging** and monitoring built into Supabase  
✅ **Same auth** as your existing Supabase setup