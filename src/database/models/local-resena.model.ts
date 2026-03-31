/**
 * Modelo de la tabla local_resena en SQLite.
 *
 * Representa las reseñas escritas por el usuario sobre películas vistas.
 * Las reseñas pueden crearse sin conexión y sincronizarse luego con Supabase.
 */
export interface LocalResena {
  /** UUID generado localmente en el dispositivo al crear la reseña offline */
  local_id: string;

  /**
   * UUID del registro en Supabase.
   * Es null hasta que la reseña se sincroniza exitosamente con el servidor.
   */
  server_id?: string | null;

  /** FK hacia local_usuario.id — autor de la reseña */
  usuario_id: string;

  /** FK hacia local_pelicula.id — película reseñada */
  pelicula_id: string;

  /**
   * Calificación numérica de la película.
   * Rango válido: 1 a 10 (validado por CHECK en SQLite).
   */
  calificacion: number;

  /** Texto de la reseña (puede omitirse, solo calificación) */
  comentario?: string | null;

  /**
   * Indica si la reseña contiene spoilers del argumento.
   * 'S' = contiene spoilers | 'N' = no contiene spoilers
   */
  tiene_spoiler: 'S' | 'N';

  /**
   * Estado de sincronización del registro.
   * Valores: 'pending' | 'synced' | 'error'
   */
  sync_status: string;

  /** Timestamp ISO 8601 de cuando se creó la reseña localmente */
  created_at: string;
}
