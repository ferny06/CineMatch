export interface LocalPeliculaVista {
  local_id: string;
  server_id?: string | null;
  usuario_id: string;
  pelicula_id: string;
  tmdb_id: number;
  titulo: string;
  poster_url?: string | null;
  genero_principal?: string | null;
  fecha_vista: string;
  sync_status: string;
  synced_at?: string | null;
}
