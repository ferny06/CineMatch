/**
 * Modelo de la tabla local_pelicula en SQLite.
 *
 * Almacena un caché local de películas consultadas desde TMDB o Supabase.
 * Los géneros se desnormalizan en el campo generos_json para evitar JOINs
 * adicionales al trabajar sin conexión.
 */
export interface LocalPelicula {
  /** UUID de la película en Supabase (espejo del campo id central) */
  id: string;

  /** ID de la película en The Movie Database (TMDB) */
  tmdb_id?: number | null;

  /** Título oficial de la película */
  titulo: string;

  /** Sinopsis o descripción argumental */
  sinopsis?: string | null;

  /** URL del póster de la película */
  poster_url?: string | null;

  /** Fecha de estreno en formato YYYY-MM-DD */
  fecha_estreno?: string | null;

  /** Duración de la película en minutos */
  duracion_min?: number | null;

  /** Promedio de votos en escala de 0.0 a 10.0 */
  promedio_votos?: number | null;

  /**
   * Array de géneros serializado como JSON.
   * Formato: [{"id": 28, "nombre": "Acción"}, {"id": 12, "nombre": "Aventura"}]
   * Se desnormaliza aquí para evitar una tabla local_genero adicional.
   */
  generos_json?: string | null;

  /** Timestamp ISO 8601 de la última sincronización con el servidor */
  synced_at: string;
}

/**
 * Representa un género individual deserializado del campo generos_json.
 * Usar JSON.parse(localPelicula.generos_json) para obtener un array de estos.
 */
export interface GeneroJson {
  /** ID del género en TMDB */
  id: number;
  /** Nombre legible del género (ej: "Acción", "Comedia") */
  nombre: string;
}
