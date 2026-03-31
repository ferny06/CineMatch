/**
 * Modelo de la tabla local_mensaje en SQLite.
 *
 * Representa los mensajes enviados en conversaciones entre usuarios.
 * Los mensajes pueden escribirse sin conexión y sincronizarse luego.
 *
 * Corrección respecto al modelo original:
 * - conversacion_id tiene FK hacia local_conversacion para garantizar
 *   integridad referencial offline. Sin esto, sería una cadena libre
 *   que permitiría mensajes huérfanos (sin conversación asociada).
 */
export interface LocalMensaje {
  /** UUID generado localmente en el dispositivo al escribir el mensaje offline */
  local_id: string;

  /**
   * UUID del mensaje en Supabase.
   * Es null hasta que el mensaje se sincroniza exitosamente con el servidor.
   */
  server_id?: string | null;

  /** FK hacia local_usuario.id — usuario que envía el mensaje */
  emisor_id: string;

  /** FK hacia local_conversacion.id — conversación a la que pertenece el mensaje */
  conversacion_id: string;

  /** Contenido textual del mensaje */
  contenido: string;

  /**
   * Indica si el destinatario ya leyó el mensaje.
   * 'S' = leído | 'N' = no leído
   */
  leido: 'S' | 'N';

  /**
   * Estado de sincronización del registro.
   * Valores: 'pending' | 'synced' | 'error'
   */
  sync_status: string;

  /** Timestamp ISO 8601 de cuando se creó el mensaje localmente */
  created_at: string;
}
