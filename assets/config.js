// Public Supabase settings. The anon key is meant to be public; row level security protects the data.
window.BT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  // Sign-in methods shown in the sign-in dialog. Each must be enabled in Supabase → Authentication → Providers.
  authProviders: ["github", "google"],
  emailLinks: false   // magic-link email sign-in (needs custom SMTP in Supabase to work for the public)
};
