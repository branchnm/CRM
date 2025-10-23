import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import * as kv from './kv_store';

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

// Get all customers
app.get('/make-server-5fb7f1b2/customers', async (c) => {
  try {
    const customers = await kv.getByPrefix('customer:');
    return c.json({ customers });
  } catch (error) {
    console.log(`Error fetching customers: ${error}`);
    return c.json({ error: 'Failed to fetch customers', details: String(error) }, 500);
  }
});

// Create a new customer
app.post('/make-server-5fb7f1b2/customers', async (c) => {
  try {
    const body = await c.req.json();
    const { name, address, phone, email, notes } = body;
    
    if (!name) {
      return c.json({ error: 'Name is required' }, 400);
    }
    
    const customerId = crypto.randomUUID();
    const customer = {
      id: customerId,
      name,
      address: address || '',
      phone: phone || '',
      email: email || '',
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(`customer:${customerId}`, customer);
    return c.json({ customer });
  } catch (error) {
    console.log(`Error creating customer: ${error}`);
    return c.json({ error: 'Failed to create customer', details: String(error) }, 500);
  }
});

// Update a customer
app.put('/make-server-5fb7f1b2/customers/:id', async (c) => {
  try {
    const customerId = c.req.param('id');
    const body = await c.req.json();
    
    const existingCustomer = await kv.get(`customer:${customerId}`);
    if (!existingCustomer) {
      return c.json({ error: 'Customer not found' }, 404);
    }
    
    const updatedCustomer = {
      ...existingCustomer,
      ...body,
      id: customerId,
      updatedAt: new Date().toISOString()
    };
    
    await kv.set(`customer:${customerId}`, updatedCustomer);
    return c.json({ customer: updatedCustomer });
  } catch (error) {
    console.log(`Error updating customer: ${error}`);
    return c.json({ error: 'Failed to update customer', details: String(error) }, 500);
  }
});

// Delete a customer
app.delete('/make-server-5fb7f1b2/customers/:id', async (c) => {
  try {
    const customerId = c.req.param('id');
    await kv.del(`customer:${customerId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting customer: ${error}`);
    return c.json({ error: 'Failed to delete customer', details: String(error) }, 500);
  }
});

export default app;
