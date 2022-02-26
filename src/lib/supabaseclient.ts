import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
	import.meta.env.VITE_APP_SUPABASE_URL as string,
	import.meta.env.VITE_APP_SUPABASE_PUBLIC_KEY as string
);

supabase.auth.onAuthStateChange((event, session) => {
	console.log(event, session);
});
