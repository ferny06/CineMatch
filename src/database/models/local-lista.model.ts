/**
 * Modelo de la tabla local_lista en SQLite.
 *
 * Representa una colección nombrada de películas creada por el usuario.
 * Un registro = una lista completa (tipo playlist) con múltiples películas.
 * ↔ lista_peliculas en Supabase (pelicula_id INTEGER[]).
 */
export interface LocalLista {
  /** UUID generado localmente en el dispositivo al crear el registro offline */
  local_id: string;

  /** UUID del registro en Supabase. Null hasta que se sincronice. */
  server_id?: string | null;

  /** FK hacia local_usuario.id — usuario dueño de la lista */
  usuario_id: string;

  /** Nombre de la lista */
  nombre: string;

  /** Descripción opcional de la lista */
  descripcion?: string | null;

  /**
   * Array de tmdb_ids de las películas en la lista.
   * Se almacena como JSON string en SQLite y se parsea al leer.
   */
  peliculas_ids: number[];

  /**
   * Estado de la lista.
   * 'activa': visible para el usuario.
   * 'borrada': borrado suave, no se muestra pero el registro persiste.
   */
  estado: 'activa' | 'borrada';

  /** Estado de sincronización: 'pending' | 'synced' | 'error' */
  sync_status: string;

  /** Timestamp ISO 8601 de creación local */
  created_at: string;
}
