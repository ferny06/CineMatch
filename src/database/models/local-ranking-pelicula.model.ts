export interface LocalRankingPelicula {
  id: string;
  pelicula_id: string;
  tmdb_id: number;
  titulo: string;
  poster_url?: string | null;
  posicion: number;
  promedio_calificacion?: number | null;
  total_resenas: number;
  synced_at?: string | null;
}
