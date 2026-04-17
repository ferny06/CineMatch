/**
 * Modelo de la tabla local_usuario_genero_preferencia en SQLite.
 *
 * Almacena el peso de preferencia de un usuario por cada género de película,
 * calculado mediante una media acumulativa ponderada (fórmula de Welford)
 * cada vez que el usuario crea una reseña.
 *
 * El género principal de la película (índice 0 en generos_json) recibe el
 * mayor peso en cada contribución; los géneros secundarios reciben pesos
 * decrecientes según su posición.
 *
 * Tabla introducida en DB_VERSION 4.
 */
export interface LocalUsuarioGeneroPreferencia {
  /** UUID generado localmente al crear el primer registro para este (usuario, género) */
  id: string;

  /** FK hacia local_usuario.id — propietario de la preferencia */
  usuario_id: string;

  /** ID del género en TMDB (ej: 28 para Acción, 12 para Aventura) */
  tmdb_genero_id: number;

  /**
   * Nombre legible del género, desnormalizado desde generos_json de local_pelicula.
   * Se almacena aquí para evitar JOINs al consultar preferencias.
   * Ej: "Acción", "Comedia", "Drama".
   */
  nombre_genero: string;

  /**
   * Peso de preferencia en escala [0.0, 1.0].
   *
   * Representa el promedio acumulativo de las contribuciones de todas las
   * reseñas que incluyen este género:
   *   - 0.0: el usuario siempre calificó con 1 estrella películas de este género.
   *   - 1.0: el usuario siempre calificó con 5 estrellas películas de este género.
   *   - 0.5: calificaciones promedio (3 estrellas) o mezcla de altas y bajas.
   *
   * Se actualiza con la fórmula de Welford:
   *   nuevo_peso = viejo_peso + (contribucion - viejo_peso) / nuevo_conteo
   */
  peso_pref: number;

  /**
   * Número de reseñas que han contribuido al cálculo de peso_pref.
   * Usado como denominador en la fórmula de Welford para calcular la media.
   */
  conteo: number;

  /**
   * Estado de sincronización con Supabase.
   * Valores: 'pending' | 'synced' | 'error'
   */
  sync_status: string;

  /**
   * Timestamp ISO 8601 de la última sincronización exitosa con el servidor.
   * Null si el registro nunca ha sido sincronizado.
   */
  synced_at?: string | null;

  /**
   * Timestamp ISO 8601 de creación del registro.
   * Se mapea a `fecha_creacion_pref` al sincronizar con Supabase.
   */
  created_at: string;
}
