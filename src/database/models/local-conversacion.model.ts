/**
 * Modelo de la tabla local_conversacion en SQLite.
 *
 * Tabla mínima para garantizar integridad referencial con local_mensaje.
 *
 * Los datos completos de la conversación (participantes, fecha, etc.)
 * residen en el servidor y no se replican completamente de forma local.
 */
export interface LocalConversacion {
  /** UUID de la conversación, espejo del campo id en Supabase */
  id: string;

  /**
   * Estado de sincronización del registro.
   * Valores: 'pending' | 'synced' | 'error'
   */
  sync_status: string;

  /** Timestamp ISO 8601 de la última sincronización con el servidor */
  synced_at: string;
}
