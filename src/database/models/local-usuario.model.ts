/**
 * Modelo de la tabla local_usuario en SQLite.
 *
 * Almacena el perfil del usuario autenticado de forma local para
 * permitir mostrar datos básicos sin conexión.
 *
 * Campos omitidos intencionalmente respecto a la tabla central:
 * - auth_user_id: gestionado por Supabase Auth; no se persiste por seguridad
 * - latitud, longitud: cambian frecuentemente; se obtienen del GPS en tiempo real
 *
 * Nota: fecha_nacimiento y genero se incluyen porque son NOT NULL en Supabase
 * y se recopilan durante el registro — sin ellos el upsert a Supabase fallaría.
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

  /**
   * Fecha de nacimiento en formato ISO YYYY-MM-DD.
   * Requerida (NOT NULL) en la tabla `usuario` de Supabase.
   * Se recopila durante el registro para que el sync no falle.
   */
  fecha_nacimiento?: string | null;

  /**
   * Género del usuario: 'Masculino' | 'Femenino' | 'Otro'.
   * Requerido (NOT NULL) en la tabla `usuario` de Supabase.
   */
  genero?: string | null;

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

  /**
   * ID del usuario en Supabase Auth (uuid).
   * Se obtiene al llamar auth.signUp() durante el registro.
   * Es NOT NULL en la tabla `usuario` de Supabase — sin él el upsert falla.
   */
  auth_user_id?: string | null;
}
