import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Twilio SMS function
async function sendViaTwilio(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')

  // Check if all environment variables are present
  if (!accountSid || !authToken || !fromNumber) {
    console.error('Missing Twilio environment variables:', {
      accountSid: !!accountSid,
      authToken: !!authToken,
      fromNumber: !!fromNumber
    })
    throw new Error('Missing Twilio credentials')
  }

  console.log(`Twilio request: FROM ${fromNumber} TO ${to}`)

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

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Twilio API error:', response.status, errorText)
    throw new Error(`Twilio API error: ${response.status} - ${errorText}`)
  }

  const responseData = await response.json()
  console.log('Twilio success:', responseData.sid)
  return true
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

    console.log(`Sending SMS to ${to}: ${message}`)
    
    const success = await sendViaTwilio(to, message)

    return new Response(
      JSON.stringify({ 
        success, 
        message: success ? 'SMS sent successfully' : 'Failed to send SMS' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: success ? 200 : 500
      }
    )

  } catch (error) {
    console.error('SMS Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})