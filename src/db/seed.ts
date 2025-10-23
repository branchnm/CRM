import { supabase } from "../lib/supabase";

// Sample customer data from App.tsx
const sampleCustomers = [
  {
    name: "Johnson House",
    address: "1234 Maple Street, Springfield, IL 62701",
    phone: "(217) 555-0123",
    email: "mjohnson@email.com",
    square_footage: 5000,
    price: 45,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: false,
    frequency: "weekly",
    notes: "Gate code: 1234. Dog in backyard - call before entering.",
  },
  {
    name: "Smith Estate",
    address: "5678 Oak Avenue, Springfield, IL 62702",
    phone: "(217) 555-0456",
    email: "smith.family@email.com",
    square_footage: 12000,
    price: 95,
    is_hilly: true,
    has_fencing: false,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Large property with multiple flower beds and trees.",
  },
  {
    name: "Martinez Property",
    address: "2345 Pine Road, Springfield, IL 62703",
    phone: "(217) 555-0789",
    email: undefined,
    square_footage: 3500,
    price: 35,
    is_hilly: false,
    has_fencing: false,
    has_obstacles: false,
    frequency: "biweekly",
    notes: "",
  },
  {
    name: "Williams Home",
    address: "8901 Elm Court, Springfield, IL 62704",
    phone: "(217) 555-0234",
    email: "twilliams@email.com",
    square_footage: 7500,
    price: 55,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Pool equipment in backyard. Please be careful around it.",
  },
  {
    name: "Brown Residence",
    address: "3456 Cedar Lane, Springfield, IL 62705",
    phone: "(217) 555-0567",
    email: undefined,
    square_footage: 4200,
    price: 40,
    is_hilly: true,
    has_fencing: false,
    has_obstacles: false,
    frequency: "weekly",
    notes: "Steep slope in front yard - use caution.",
  },
  {
    name: "Davis Property",
    address: "6789 Birch Drive, Springfield, IL 62706",
    phone: "(217) 555-0890",
    email: "ldavis@email.com",
    square_footage: 6000,
    price: 48,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: false,
    frequency: "weekly",
    notes: "",
  },
  {
    name: "Miller Estate",
    address: "4567 Willow Way, Springfield, IL 62707",
    phone: "(217) 555-0345",
    email: undefined,
    square_footage: 15000,
    price: 120,
    is_hilly: true,
    has_fencing: true,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Large estate. Enter through side gate. Client prefers service between 8-10 AM.",
  },
  {
    name: "Garcia Home",
    address: "7890 Spruce Street, Springfield, IL 62708",
    phone: "(217) 555-0678",
    email: "garcia.family@email.com",
    square_footage: 4500,
    price: 42,
    is_hilly: false,
    has_fencing: false,
    has_obstacles: true,
    frequency: "biweekly",
    notes: "Lots of garden decorations - trim carefully.",
  },
  {
    name: "Anderson Property",
    address: "2109 Hickory Place, Springfield, IL 62709",
    phone: "(217) 555-0901",
    email: undefined,
    square_footage: 5500,
    price: 50,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: false,
    frequency: "weekly",
    notes: "",
  },
  {
    name: "Taylor Residence",
    address: "3210 Walnut Boulevard, Springfield, IL 62710",
    phone: "(217) 555-0123",
    email: "ktaylor@email.com",
    square_footage: 8000,
    price: 65,
    is_hilly: true,
    has_fencing: false,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Hilly backyard. Client leaves payment under doormat.",
  },
];

async function seedCustomers() {
  console.log("Starting customer seed...");

  try {
    // Check if customers already exist
    const { data: existing, error: checkError } = await supabase
      .from("customers")
      .select("id")
      .limit(1);

    if (checkError) {
      console.error("Error checking existing customers:", checkError);
      throw checkError;
    }

    if (existing && existing.length > 0) {
      console.log("⚠️  Customers table already has data. Skipping seed.");
      console.log("If you want to re-seed, delete all customers first.");
      return;
    }

    // Insert sample customers
    const { data, error } = await supabase
      .from("customers")
      .insert(sampleCustomers)
      .select();

    if (error) {
      console.error("Error seeding customers:", error);
      throw error;
    }

    console.log(`✅ Successfully seeded ${data.length} customers!`);
    console.log("Sample customers uploaded to Supabase.");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  }
}

// Run the seed
seedCustomers().catch(console.error);
