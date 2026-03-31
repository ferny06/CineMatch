/**
 * Modelo de la tabla local_usuario en SQLite.
 *
 * Almacena el perfil del usuario autenticado de forma local para
 * permitir mostrar datos básicos sin conexión.
 *
 * Campos omitidos intencionalmente respecto a la tabla central:
 * - auth_user_id: gestionado por Supabase Auth; no se persiste por seguridad
 * - fecha_nacimiento, genero: no son necesarios offline
 * - latitud, longitud: cambian frecuentemente; se obtienen del GPS en tiempo real
 */
export interface LocalUsuario {
  /** UUID del usuario, espejo del campo id en Supabase */
  id: string;

  /** Nombre de usuario público (ej: @moviefan99) */
  nombre_user?: string | null;

  /** Nombre real del usuario */
  nombre?: string | null;

  /** Primer apellido */
  apellido_1?: string | null;

  /** Segundo apellido */
  apellido_2?: string | null;

  /** Correo electrónico del usuario */
  email?: string | null;

  /** URL del avatar almacenado en Supabase Storage */
  avatar_url?: string | null;

  /** Biografía corta del usuario */
  bio?: string | null;

  /** Radio en kilómetros para buscar conexiones cercanas */
  radio_conex?: number | null;

  /**
   * Indica si el usuario acepta nuevas conexiones.
   * 'S' = sí acepta | 'N' = no acepta
   */
  busqueda_abierta?: 'S' | 'N' | null;

  /**
   * Estado de sincronización del registro.
   * Valores: 'pending' | 'synced' | 'error'
   */
  sync_status: string;

  /** Timestamp ISO 8601 de la última sincronización exitosa con el servidor */
  synced_at: string;
}
