import { supabase } from "../lib/supabase";

// Sample customer data from App.tsx
const sampleCustomers = [
  {
    name: "Johnson House",
    address: "128 Edgewood Blvd, Homewood, AL 35209",
    phone: "(205) 555-0123",
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
    address: "1842 Oxmoor Rd, Homewood, AL 35209",
    phone: "(205) 555-0456",
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
    address: "512 Central Ave, Homewood, AL 35209",
    phone: "(205) 555-0789",
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
    address: "2145 Hollywood Blvd, Homewood, AL 35209",
    phone: "(205) 555-0234",
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
    address: "1706 Woodland Ave, Homewood, AL 35209",
    phone: "(205) 555-0567",
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
    address: "3029 Central Ave, Homewood, AL 35209",
    phone: "(205) 555-0890",
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
    address: "1920 Montevallo Rd, Homewood, AL 35209",
    phone: "(205) 555-0345",
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
    address: "224 Delcris Dr, Homewood, AL 35209",
    phone: "(205) 555-0678",
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
    address: "1512 Rosewood Ln, Homewood, AL 35209",
    phone: "(205) 555-0901",
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
    address: "2801 Linden Ave, Homewood, AL 35209",
    phone: "(205) 555-0123",
    email: "ktaylor@email.com",
    square_footage: 8000,
    price: 65,
    is_hilly: true,
    has_fencing: false,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Hilly backyard. Client leaves payment under doormat.",
  },
  {
    name: "Roberts Home",
    address: "1405 Saulter Rd, Homewood, AL 35209",
    phone: "(205) 555-1001",
    email: "jroberts@email.com",
    square_footage: 5200,
    price: 47,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: false,
    frequency: "weekly",
    notes: "Park in driveway. Key under mat for equipment shed.",
  },
  {
    name: "Thompson Property",
    address: "817 Palmetto St, Homewood, AL 35209",
    phone: "(205) 555-1102",
    email: undefined,
    square_footage: 4800,
    price: 43,
    is_hilly: true,
    has_fencing: false,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Watch for sprinkler heads near front walkway.",
  },
  {
    name: "Wilson Estate",
    address: "2234 Montevallo Rd, Homewood, AL 35209",
    phone: "(205) 555-1203",
    email: "wilson.home@email.com",
    square_footage: 9500,
    price: 75,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Large corner lot. Side gate code: 5678.",
  },
  {
    name: "Martin Residence",
    address: "1623 Carr Ave, Homewood, AL 35209",
    phone: "(205) 555-1304",
    email: "rmartin@email.com",
    square_footage: 4100,
    price: 38,
    is_hilly: false,
    has_fencing: false,
    has_obstacles: false,
    frequency: "biweekly",
    notes: "",
  },
  {
    name: "Lee Property",
    address: "1918 Oxmoor Rd, Homewood, AL 35209",
    phone: "(205) 555-1405",
    email: undefined,
    square_footage: 6200,
    price: 52,
    is_hilly: true,
    has_fencing: true,
    has_obstacles: false,
    frequency: "weekly",
    notes: "Steep driveway. Extra time needed for hillside.",
  },
  {
    name: "White Home",
    address: "1340 Broadway St, Homewood, AL 35209",
    phone: "(205) 555-1506",
    email: "white.family@email.com",
    square_footage: 5500,
    price: 48,
    is_hilly: false,
    has_fencing: false,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Lots of landscaping. Take care around flower beds.",
  },
  {
    name: "Harris Estate",
    address: "2712 Central Ave, Homewood, AL 35209",
    phone: "(205) 555-1607",
    email: undefined,
    square_footage: 11000,
    price: 90,
    is_hilly: true,
    has_fencing: true,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Premium property. Client expects detailed edging.",
  },
  {
    name: "Clark Property",
    address: "1834 Shades Crest Rd, Homewood, AL 35209",
    phone: "(205) 555-1708",
    email: "mclark@email.com",
    square_footage: 7200,
    price: 58,
    is_hilly: true,
    has_fencing: false,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Mountain view property. Very steep terrain.",
  },
  {
    name: "Young Residence",
    address: "916 Green Springs Ave, Homewood, AL 35209",
    phone: "(205) 555-1809",
    email: "young.home@email.com",
    square_footage: 4600,
    price: 41,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: false,
    frequency: "weekly",
    notes: "Fenced backyard with gate access from alley.",
  },
  {
    name: "King Home",
    address: "2145 Lakeshore Dr, Homewood, AL 35209",
    phone: "(205) 555-1910",
    email: undefined,
    square_footage: 8200,
    price: 68,
    is_hilly: false,
    has_fencing: true,
    has_obstacles: true,
    frequency: "weekly",
    notes: "Lakefront property. Extra cleanup needed in fall.",
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
