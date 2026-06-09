const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5ZHBudmFqd2Z6Y3N4c293Y3RwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA4OTgxMiwiZXhwIjoyMDkwNjY1ODEyfQ.F2fwjdeoe_0gc1DFp1vND31DEDtMuGfDSdh15Rr0ZEs";

async function run() {
  console.log("Fetching auth users...");
  const res = await fetch("https://tydpnvajwfzcsxsowctp.supabase.co/auth/v1/admin/users", {
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`
    }
  });
  if (!res.ok) {
    console.error("Failed to fetch auth users:", res.status, await res.text());
    return;
  }
  const data = await res.json();
  console.log("Auth users count:", data.users.length);
  for (const u of data.users) {
    console.log(`ID: ${u.id} | Email: ${u.email} | Phone: ${u.phone}`);
  }
}

run().catch(console.error);
