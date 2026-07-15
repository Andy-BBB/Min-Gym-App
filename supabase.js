const SUPABASE_URL = "https://jmtveyachmvadzxhnjkq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UDFuaVwoNT4WiWsSMQih8w_b0dLhMkt";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("Supabase-klienten är skapad.");