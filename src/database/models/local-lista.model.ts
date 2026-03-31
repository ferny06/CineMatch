/**
 * Modelo de la tabla local_lista en SQLite.
 *
 * Representa la lista personal de películas del usuario:
 * películas vistas, pendientes por ver, favoritas, etc.
 * Permite crear y modificar entradas sin conexión.
 *
 * Corrección respecto al modelo original:
 * - Se agrega fecha_visto (presente en la tabla central lista_peliculas)
 *   para no perder el dato cuando el usuario marca una película como vista offline.
 */
export interface LocalLista {
  /** UUID generado localmente en el dispositivo al crear el registro offline */
  local_id: string;

  /**
   * UUID del registro en Supabase.
   * Es null hasta que el registro se sincroniza exitosamente con el servidor.
   */
  server_id?: string | null;

  /** FK hacia local_usuario.id — usuario dueño de la lista */
  usuario_id: string;

  /** FK hacia local_pelicula.id — película agregada a la lista */
  pelicula_id: string;

  /**
   * Estado de la película en la lista.
   * Ejemplos: 'vista', 'pendiente', 'favorita'
   */
  estado: string;

  /**
   * Fecha en que el usuario marcó la película como vista.
   * Formato ISO 8601. Null si el estado no es 'vista'.
   */
  fecha_visto?: string | null;

  /**
   * Estado de sincronización del registro.
   * Valores: 'pending' | 'synced' | 'error'
   */
  sync_status: string;

  /** Timestamp ISO 8601 de cuando se creó el registro localmente */
  created_at: string;
}
