// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,

  // ─── Supabase ───────────────────────────────────────────────────────────────
  // URL del proyecto CineMatch en Supabase.
  // Se obtiene desde: Supabase Dashboard → Settings → API → Project URL
  supabaseUrl: 'https://vfhnqujmbaemmmhfurwp.supabase.co',

  // Clave pública (anon key) del proyecto.
  // Es seguro incluirla en el cliente; el acceso real está controlado por RLS.
  // Se obtiene desde: Supabase Dashboard → Settings → API → Project API keys → anon / public
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmaG5xdWptYmFlbW1taGZ1cndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MTQ3MjYsImV4cCI6MjA5MDQ5MDcyNn0.7POOZPWv6MkUTfmltHq6UhSAiLOp9rMzqJOpk4qo3V0'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
