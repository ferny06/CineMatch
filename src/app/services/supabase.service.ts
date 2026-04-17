/**
 * SupabaseService — CineMatch
 *
 * Responsabilidades:
 *  - Crear y exponer el cliente de Supabase (singleton, providedIn: 'root')
 *  - Proveer métodos tipados para cada operación DML (upsert/insert/update/delete)
 *    que el SyncService necesita al procesar la cola de sincronización
 *  - Mapear los nombres de campo locales (SQLite) a los del esquema central de Supabase
 *
 * Tablas centrales y su relación con el esquema local:
 *   local_usuario      ←→  usuario
 *   local_pelicula     ←→  pelicula  +  genero  +  pelicula_genero (pivote)
 *   local_lista        ←→  lista_peliculas
 *   local_resena       ←→  resena
 *   local_mensaje      ←→  mensaje
 *   local_conversacion  ←  conversacion  (solo lectura; se crea en el servidor)
 *
 * Convención de campos:
 *   - Los campos `local_id`, `server_id`, `sync_status` y `synced_at` son
 *     exclusivos de SQLite y nunca se envían a Supabase.
 *   - Diferencias de nombre entre esquemas (ej: `created_at` → `fecha_creacion`)
 *     se resuelven aquí, en el mapeo previo al upsert.
 */

import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { LocalUsuario } from '../../database/models/local-usuario.model';
import { LocalPelicula, GeneroJson } from '../../database/models/local-pelicula.model';
import { LocalLista } from '../../database/models/local-lista.model';
import { LocalResena } from '../../database/models/local-resena.model';
import { LocalMensaje } from '../../database/models/local-mensaje.model';
import { LocalUsuarioGeneroPreferencia } from '../../database/models/local-usuario-genero-preferencia.model';

// ─── Tipos de retorno de los métodos de Supabase ─────────────────────────────

/** Resultado genérico devuelto por todos los métodos de este servicio */
export interface SupabaseResult<T = any> {
  /** Datos devueltos por Supabase (puede ser null si no aplica) */
  data: T | null;
  /** Mensaje de error de Supabase (null si la operación fue exitosa) */
  error: string | null;
}

// ─── Tipos de las filas del esquema central ───────────────────────────────────
// Se definen aquí para evitar dependencias de un archivo de tipos generado.

/** Fila de la tabla `usuario` en Supabase */
interface UsuarioRow {
  id: string;
  auth_user_id?: string;
  nombre_user: string;
  nombre: string;
  apellido_1: string;
  apellido_2: string;
  email: string;
  // Estos campos son obligatorios en Supabase pero pueden estar ausentes en el
  // caché local (la app los obtiene durante el flujo de registro completo).
  fecha_nacimiento?: string;
  genero?: string;
  radio_conex?: number;
  busqueda_abierta?: string;
  avatar_url?: string | null;
  bio?: string | null;
  latitud?: number | null;
  longitud?: number | null;
}

/** Fila de la tabla `lista_peliculas` en Supabase */
interface ListaRow {
  usuario_id: string;
  pelicula_id: string;
  estado: string;
  fecha_visto?: string | null;
  fecha_creacion: string;
}

/** Fila de la tabla `resena` en Supabase */
interface ResenaRow {
  usuario_id: string;
  pelicula_id: string;
  calificacion: number;
  comentario?: string | null;
  tiene_spoiler: string;
  fecha_creacion: string;
}

/** Fila de la tabla `mensaje` en Supabase */
interface MensajeRow {
  conversacion_id: string;
  emisor_id: string;
  contenido: string;
  leido: string;
  fecha_envio: string;
}

/**
 * Fila de la tabla `usuario_genero_preferencia` en Supabase.
 *
 * Columnas reales:
 *   id                  — UUID (generado localmente)
 *   usuario_id          — FK → usuario.id
 *   genero_id           — FK → genero.id (INTEGER PK de la tabla genero)
 *   peso_pref           — NUMBER(3,2) ∈ [0.00, 1.00]
 *   fecha_creacion_pref — TIMESTAMP de creación
 *
 * Campos locales que NO se envían al servidor: tmdb_genero_id, nombre_genero,
 * conteo, sync_status, synced_at.
 */
interface UsuarioGeneroPreferenciaRow {
  id: string;
  usuario_id: string;
  genero_id: number;           // PK de la tabla genero (no el tmdb_id)
  peso_pref: number;
  fecha_creacion_pref: string; // ISO 8601 → mapea desde local created_at
}

/** Fila mínima de `conversacion` que se almacena en el caché local */
export interface ConversacionRow {
  id: string;
  conexion_id: string;
  fecha_creacion: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root', // Singleton automático: no requiere registro en AppModule
})
export class SupabaseService {

  /**
   * Cliente oficial de Supabase.
   * Se inicializa una sola vez con las credenciales del proyecto CineMatch.
   * Es `public` para que el SyncService pueda acceder directamente si lo necesita.
   */
  public readonly supabase: SupabaseClient;

  constructor() {
    // Crear el cliente con la URL y la anon key definidas en environment.ts.
    // El cliente de Supabase gestiona internamente los headers HTTP (apikey,
    // Authorization) en cada petición.
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey
    );

    console.log('[SupabaseService] Cliente inicializado correctamente.');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Crea una cuenta en Supabase Auth con email y contraseña.
   *
   * Debe llamarse ANTES de insertar en la tabla `usuario` porque `auth_user_id`
   * es NOT NULL en esa tabla y solo se obtiene aquí.
   *
   * @param email    Correo del nuevo usuario
   * @param password Contraseña elegida por el usuario
   * @returns `{ authUserId }` si fue exitoso, o `{ error }` si falló
   */
  async signUp(email: string, password: string): Promise<SupabaseResult<{ authUserId: string }>> {
    const { data, error } = await this.supabase.auth.signUp({ email, password });

    if (error) {
      return { data: null, error: error.message };
    }

    const authUserId = data.user?.id;
    if (!authUserId) {
      return { data: null, error: 'signUp completado pero no se recibió user.id de Supabase Auth' };
    }

    return { data: { authUserId }, error: null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // USUARIO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta o actualiza un usuario en Supabase.
   *
   * Se usa `upsert` (INSERT … ON CONFLICT UPDATE) con el campo `id` como clave
   * de conflicto, lo que permite tanto el registro inicial como actualizaciones
   * posteriores del perfil con la misma llamada.
   *
   * Campos omitidos:
   *  - `sync_status`, `synced_at`: son exclusivos del esquema local SQLite
   *
   * @param usuario Registro local del usuario a sincronizar
   * @returns Objeto con `data` (fila actualizada) y `error` (mensaje si falló)
   */
  async upsertUsuario(usuario: LocalUsuario): Promise<SupabaseResult> {
    const payload: Partial<UsuarioRow> = {
      id:               usuario.id,
      // auth_user_id es NOT NULL en Supabase — se obtiene de signUp() y se
      // persiste en local_usuario para que este upsert siempre lo envíe.
      auth_user_id:     usuario.auth_user_id     ?? undefined,
      nombre_user:      usuario.nombre_user      ?? '',
      nombre:           usuario.nombre           ?? '',
      apellido_1:       usuario.apellido_1       ?? '',
      apellido_2:       usuario.apellido_2       ?? '',
      email:            usuario.email            ?? '',
      fecha_nacimiento: usuario.fecha_nacimiento ?? undefined,
      genero:           usuario.genero           ?? undefined,
      radio_conex:      usuario.radio_conex      ?? undefined,
      busqueda_abierta: usuario.busqueda_abierta ?? undefined,
      avatar_url:       usuario.avatar_url       ?? null,
      bio:              usuario.bio              ?? null,
    };

    const { data, error } = await this.supabase
      .from('usuario')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    return { data, error: error?.message ?? null };
  }

  /**
   * Obtiene el perfil del usuario desde Supabase a partir del UUID de Supabase Auth.
   *
   * Se usa para restaurar `local_usuario` después de un login cuando la tabla
   * local está vacía (ej: después de reinstalar la app o de que la BD se reinicialice).
   *
   * @param authUserId UUID de Supabase Auth (session.user.id)
   * @returns Fila completa de `usuario` o null si no existe
   */
  async getUsuarioPorAuthId(authUserId: string): Promise<SupabaseResult<UsuarioRow>> {
    const { data, error } = await this.supabase
      .from('usuario')
      .select('id, auth_user_id, nombre_user, nombre, apellido_1, apellido_2, email, fecha_nacimiento, genero, radio_conex, busqueda_abierta, avatar_url, bio')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    return { data: data ?? null, error: error?.message ?? null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PELÍCULA
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta o actualiza una película en Supabase, incluyendo sus géneros.
   *
   * El flujo de sync para `pelicula` es más complejo que otras entidades porque
   * Supabase usa tablas normalizadas (`genero` + `pelicula_genero`) mientras que
   * el esquema local almacena los géneros como JSON desnormalizado (`generos_json`).
   *
   * Pasos:
   *  1. Upsert de la fila en `pelicula` (clave de conflicto: `tmdb_id`)
   *  2. Por cada género en `generos_json`:
   *     a. Upsert en `genero` (clave de conflicto: `tmdb_id`)
   *     b. Upsert en `pelicula_genero` con el par (pelicula_id, genero_id)
   *
   * @param pelicula Registro local de la película a sincronizar
   * @returns Objeto con `data` (id Supabase de la película) y `error`
   */
  async upsertPelicula(pelicula: LocalPelicula): Promise<SupabaseResult<string>> {
    // ── Paso 1: Upsert de la película ─────────────────────────────────────────
    const peliculaPayload = {
      tmdb_id:         pelicula.tmdb_id!,
      titulo:          pelicula.titulo,
      sinopsis:        pelicula.sinopsis        ?? null,
      fecha_estreno:   pelicula.fecha_estreno   ?? null,
      poster_url:      pelicula.poster_url      ?? null,
      duracion_min:    pelicula.duracion_min    ?? null,
      promedio_votos:  pelicula.promedio_votos  ?? null,
      idioma_original: pelicula.idioma_original ?? null,
    };

    const { data: pelData, error: pelError } = await this.supabase
      .from('pelicula')
      .upsert(peliculaPayload, { onConflict: 'tmdb_id' })
      .select('id')   // Necesitamos el UUID de Supabase para el pivote
      .single();

    if (pelError) {
      return { data: null, error: pelError.message };
    }

    const peliculaServerId: string = pelData.id;

    // ── Paso 2: Upsert de géneros si existen en el JSON local ────────────────
    if (pelicula.generos_json) {
      let generos: GeneroJson[] = [];

      // Parsear el JSON de géneros almacenado como texto en SQLite
      try {
        generos = JSON.parse(pelicula.generos_json) as GeneroJson[];
      } catch {
        // JSON malformado: continuar sin géneros (la película ya fue sincronizada)
        console.warn('[SupabaseService] generos_json inválido para tmdb_id:', pelicula.tmdb_id);
      }

      for (const genero of generos) {
        // ── Paso 2a: Obtener o insertar el género por tmdb_id ────────────────
        // Se usa SELECT + INSERT en lugar de upsert onConflict porque el upsert
        // requiere un UNIQUE constraint en la columna de conflicto, que puede no
        // estar definido en todos los entornos de Supabase del proyecto.
        let { data: genData } = await this.supabase
          .from('genero')
          .select('id')
          .eq('tmdb_id', genero.id)
          .maybeSingle();

        if (!genData) {
          const { data: insertData, error: insertError } = await this.supabase
            .from('genero')
            .insert({
              nombre:  genero.nombre,
              slug:    this.generarSlug(genero.nombre),
              tmdb_id: genero.id,
            })
            .select('id')
            .single();

          if (insertError) {
            console.warn('[SupabaseService] Error al insertar género:', insertError.message);
            continue; // Continuar con el siguiente género sin abortar la película
          }

          genData = insertData;
        }

        // ── Paso 2b: Insertar pivote pelicula_genero si no existe ────────────
        const { data: pivoteExiste } = await this.supabase
          .from('pelicula_genero')
          .select('pelicula_id')
          .eq('pelicula_id', peliculaServerId)
          .eq('genero_id', genData!.id)
          .maybeSingle();

        if (!pivoteExiste) {
          await this.supabase
            .from('pelicula_genero')
            .insert({ pelicula_id: peliculaServerId, genero_id: genData!.id });
        }
      }
    }

    return { data: peliculaServerId, error: null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // LISTA DE PELÍCULAS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta una entrada nueva en `lista_peliculas` de Supabase.
   *
   * Diferencias de nombre entre esquemas:
   *  - `created_at` (local) → `fecha_creacion` (Supabase)
   *  - `local_id` / `server_id` (local) → no se envían a Supabase
   *
   * @param lista Registro local de la entrada en la lista
   * @returns Objeto con `data` (id Supabase asignado) y `error`
   */
  async insertLista(lista: LocalLista): Promise<SupabaseResult<string>> {
    const payload: ListaRow = {
      usuario_id:    lista.usuario_id,
      pelicula_id:   lista.pelicula_id,
      estado:        lista.estado,
      fecha_visto:   lista.fecha_visto  ?? null,
      // `created_at` en SQLite es equivalente a `fecha_creacion` en Supabase
      fecha_creacion: lista.created_at,
    };

    const { data, error } = await this.supabase
      .from('lista_peliculas')
      .insert(payload)
      .select('id')
      .single();

    return { data: data?.id ?? null, error: error?.message ?? null };
  }

  /**
   * Actualiza una entrada existente en `lista_peliculas` de Supabase.
   *
   * Solo se actualizan los campos modificables por el usuario (estado, fecha_visto).
   *
   * @param serverId UUID de Supabase de la entrada a actualizar
   * @param lista    Registro local con los valores actualizados
   */
  async updateLista(serverId: string, lista: LocalLista): Promise<SupabaseResult> {
    const { data, error } = await this.supabase
      .from('lista_peliculas')
      .update({
        estado:      lista.estado,
        fecha_visto: lista.fecha_visto ?? null,
      })
      .eq('id', serverId)
      .select()
      .single();

    return { data, error: error?.message ?? null };
  }

  /**
   * Elimina una entrada de `lista_peliculas` en Supabase.
   *
   * @param serverId UUID de Supabase de la entrada a eliminar
   */
  async deleteLista(serverId: string): Promise<SupabaseResult> {
    const { data, error } = await this.supabase
      .from('lista_peliculas')
      .delete()
      .eq('id', serverId);

    return { data, error: error?.message ?? null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESEÑAS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta una nueva reseña en Supabase.
   *
   * Diferencias de nombre: `created_at` (local) → `fecha_creacion` (Supabase).
   * El campo `tiene_spoiler` usa 'S'/'N' en ambos esquemas (compatible).
   *
   * @param resena Registro local de la reseña
   * @returns Objeto con `data` (id Supabase asignado) y `error`
   */
  async insertResena(resena: LocalResena): Promise<SupabaseResult<string>> {
    const payload: ResenaRow = {
      usuario_id:    resena.usuario_id,
      pelicula_id:   resena.pelicula_id,
      calificacion:  resena.calificacion,
      comentario:    resena.comentario   ?? null,
      tiene_spoiler: resena.tiene_spoiler,
      fecha_creacion: resena.created_at,
    };

    const { data, error } = await this.supabase
      .from('resena')
      .insert(payload)
      .select('id')
      .single();

    return { data: data?.id ?? null, error: error?.message ?? null };
  }

  /**
   * Actualiza una reseña existente en Supabase.
   *
   * Solo se actualizan los campos editables (calificacion, comentario, tiene_spoiler).
   *
   * @param serverId UUID de Supabase de la reseña a actualizar
   * @param resena   Registro local con los valores actualizados
   */
  async updateResena(serverId: string, resena: LocalResena): Promise<SupabaseResult> {
    const { data, error } = await this.supabase
      .from('resena')
      .update({
        calificacion:  resena.calificacion,
        comentario:    resena.comentario   ?? null,
        tiene_spoiler: resena.tiene_spoiler,
      })
      .eq('id', serverId)
      .select()
      .single();

    return { data, error: error?.message ?? null };
  }

  /**
   * Elimina una reseña en Supabase.
   *
   * @param serverId UUID de Supabase de la reseña a eliminar
   */
  async deleteResena(serverId: string): Promise<SupabaseResult> {
    const { data, error } = await this.supabase
      .from('resena')
      .delete()
      .eq('id', serverId);

    return { data, error: error?.message ?? null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PULL — lectura desde Supabase hacia local
  // ══════════════════════════════════════════════════════════════════════════════

  async pullResenas(usuarioId: string): Promise<SupabaseResult<any[]>> {
    const { data, error } = await this.supabase
      .from('resena')
      .select(`
        id, calificacion, comentario, tiene_spoiler, fecha_creacion,
        pelicula!inner (
          id, tmdb_id, titulo, sinopsis, poster_url,
          fecha_estreno, duracion_min, promedio_votos, idioma_original
        )
      `)
      .eq('usuario_id', usuarioId);
    return { data: data ?? null, error: error?.message ?? null };
  }

  async pullListas(usuarioId: string): Promise<SupabaseResult<any[]>> {
    const { data, error } = await this.supabase
      .from('lista_peliculas')
      .select(`
        id, estado, fecha_visto, fecha_creacion,
        pelicula!inner (
          id, tmdb_id, titulo, sinopsis, poster_url,
          fecha_estreno, duracion_min, promedio_votos, idioma_original
        )
      `)
      .eq('usuario_id', usuarioId);
    return { data: data ?? null, error: error?.message ?? null };
  }

  async pullPreferencias(usuarioId: string): Promise<SupabaseResult<any[]>> {
    const { data, error } = await this.supabase
      .from('usuario_genero_preferencia')
      .select(`
        id, peso_pref, fecha_creacion_pref,
        genero!inner ( tmdb_id, nombre )
      `)
      .eq('usuario_id', usuarioId);
    return { data: data ?? null, error: error?.message ?? null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MENSAJES
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta un nuevo mensaje en Supabase.
   *
   * Diferencias de nombre: `created_at` (local) → `fecha_envio` (Supabase).
   * El campo `leido` usa 'S'/'N' en ambos esquemas (compatible).
   *
   * Requisito previo: `conversacion_id` debe existir ya en Supabase (FK NOT NULL).
   * La conversación se crea desde el servidor al aceptar una conexión entre usuarios.
   *
   * @param mensaje Registro local del mensaje a enviar
   * @returns Objeto con `data` (id Supabase asignado) y `error`
   */
  async insertMensaje(mensaje: LocalMensaje): Promise<SupabaseResult<string>> {
    const payload: MensajeRow = {
      conversacion_id: mensaje.conversacion_id,
      emisor_id:       mensaje.emisor_id,
      contenido:       mensaje.contenido,
      leido:           mensaje.leido,
      // `created_at` local equivale a `fecha_envio` en Supabase
      fecha_envio:     mensaje.created_at,
    };

    const { data, error } = await this.supabase
      .from('mensaje')
      .insert(payload)
      .select('id')
      .single();

    return { data: data?.id ?? null, error: error?.message ?? null };
  }

  /**
   * Actualiza el estado de lectura de un mensaje existente en Supabase.
   *
   * @param serverId UUID de Supabase del mensaje a actualizar
   * @param mensaje  Registro local con el valor actualizado de `leido`
   */
  async updateMensaje(serverId: string, mensaje: LocalMensaje): Promise<SupabaseResult> {
    const { data, error } = await this.supabase
      .from('mensaje')
      .update({ leido: mensaje.leido })
      .eq('id', serverId)
      .select()
      .single();

    return { data, error: error?.message ?? null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CONVERSACIONES (solo lectura — PULL desde Supabase)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Descarga las conversaciones activas del servidor para poblar el caché local.
   *
   * Las conversaciones NO se crean desde el cliente; las genera el servidor cuando
   * dos usuarios forman una `conexion`. Por eso el flujo es PULL (Supabase → local).
   *
   * La consulta busca conversaciones donde el usuario participa como `solicitante`
   * o `destinatario` en la `conexion` padre.
   *
   * @param usuarioId UUID del usuario autenticado
   * @returns Lista de conversaciones con id y conexion_id para el caché local
   */
  async pullConversaciones(usuarioId: string): Promise<SupabaseResult<ConversacionRow[]>> {
    // Usamos un join implícito de PostgREST: conversacion → conexion → usuario
    const { data, error } = await this.supabase
      .from('conversacion')
      .select(`
        id,
        conexion_id,
        fecha_creacion,
        conexion!inner (
          solicitante_id,
          destinatario_id
        )
      `)
      // Filtrar solo las conversaciones del usuario actual
      .or(`solicitante_id.eq.${usuarioId},destinatario_id.eq.${usuarioId}`, {
        referencedTable: 'conexion',
      });

    if (error) {
      return { data: null, error: error.message };
    }

    // Extraer solo los campos que necesita el caché local
    const conversaciones: ConversacionRow[] = (data ?? []).map((row: any) => ({
      id:             row.id,
      conexion_id:    row.conexion_id,
      fecha_creacion: row.fecha_creacion,
    }));

    return { data: conversaciones, error: null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PREFERENCIAS DE GÉNERO
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Inserta o actualiza una preferencia de género en la tabla
   * `usuario_genero_preferencia` de Supabase.
   *
   * La tabla del servidor usa `genero_id` (FK → genero.id, INTEGER),
   * no el `tmdb_genero_id` almacenado localmente. Por eso se busca
   * primero el `genero.id` correspondiente al `tmdb_genero_id` local.
   * Este lookup es seguro porque `upsertPelicula` (Tier 1 del sync)
   * ya habrá creado el registro de género antes de que se procese esta
   * preferencia (Tier 2).
   *
   * Campos locales excluidos del payload: tmdb_genero_id, nombre_genero,
   * conteo, sync_status, synced_at — son exclusivos del esquema SQLite.
   *
   * El upsert usa onConflict='usuario_id,genero_id' para manejar el caso
   * en que el servidor ya tenga un registro para ese par, independientemente
   * del UUID local.
   *
   * @param pref Registro local de preferencia a sincronizar
   * @returns SupabaseResult estándar
   */
  async upsertPreferenciaGenero(
    pref: LocalUsuarioGeneroPreferencia
  ): Promise<SupabaseResult> {

    // ── Paso 1: Resolver genero.id a partir del tmdb_genero_id local ─────────
    // La tabla central usa genero_id (PK entera de la tabla genero),
    // no el tmdb_id de TMDB directamente.
    const { data: genData, error: genError } = await this.supabase
      .from('genero')
      .select('id')
      .eq('tmdb_id', pref.tmdb_genero_id)
      .maybeSingle();

    if (genError || !genData) {
      // Prefijo especial para que SyncService distinga este error transitorio (dependencia de
      // upsertPelicula aún no ejecutada) de un error permanente. Al detectarlo, el ítem se
      // resetea a 'pendiente' sin consumir un intento, evitando que MAX_REINTENTOS se agote
      // antes de que upsertPelicula cree el género en Supabase.
      return {
        data: null,
        error: `GENRE_NOT_FOUND:tmdb_id=${pref.tmdb_genero_id}`,
      };
    }

    // ── Paso 2: Upsert con los campos del esquema central ─────────────────────
    const payload: UsuarioGeneroPreferenciaRow = {
      id:                  pref.id,
      usuario_id:          pref.usuario_id,
      genero_id:           genData.id,        // PK de la tabla genero (INTEGER)
      peso_pref:           pref.peso_pref,
      fecha_creacion_pref: pref.created_at,   // ISO 8601 → TIMESTAMP en Supabase
    };

    const { data, error } = await this.supabase
      .from('usuario_genero_preferencia')
      .upsert(payload, { onConflict: 'usuario_id,genero_id' })
      .select()
      .single();

    return { data, error: error?.message ?? null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GEOLOCALIZACIÓN
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Actualiza las coordenadas GPS del usuario en Supabase.
   *
   * Se invoca cada vez que el usuario entra a la página de sugerencias para
   * mantener la ubicación actualizada en tiempo real.
   *
   * @param id      UUID del usuario en Supabase
   * @param latitud Latitud GPS actual
   * @param longitud Longitud GPS actual
   */
  async actualizarUbicacionUsuario(
    id: string,
    latitud: number,
    longitud: number
  ): Promise<void> {
    const { error } = await this.supabase
      .from('usuario')
      .update({ latitud, longitud })
      .eq('id', id);

    if (error) {
      console.warn('[SupabaseService] Error al actualizar ubicación:', error.message);
    }
  }

  /**
   * Obtiene todos los usuarios con búsqueda abierta que tienen coordenadas GPS
   * registradas, excluyendo al usuario actual.
   *
   * Incluye las preferencias de género de cada usuario mediante nested select
   * para poder calcular la similitud de gustos en el cliente.
   *
   * @param excluirId UUID del usuario actual (para excluirlo de los resultados)
   * @returns Lista de usuarios candidatos con sus preferencias de género
   */
  async obtenerUsuariosCercanos(excluirId: string): Promise<SupabaseResult<any[]>> {
    const { data, error } = await this.supabase
      .from('usuario')
      .select(`
        id, nombre_user, nombre, avatar_url, latitud, longitud, radio_conex,
        usuario_genero_preferencia (
          peso_pref,
          genero ( tmdb_id, nombre )
        )
      `)
      .eq('busqueda_abierta', 'S')
      .not('latitud', 'is', null)
      .not('longitud', 'is', null)
      .neq('id', excluirId);

    return { data: data ?? null, error: error?.message ?? null };
  }

  /**
   * Obtiene los amigos (conexiones aceptadas) del usuario actual.
   *
   * @param usuarioId UUID del usuario actual
   * @returns Lista de perfiles de amigos con id, nombre y avatar
   */
  async obtenerAmigos(usuarioId: string): Promise<SupabaseResult<any[]>> {
    const { data, error } = await this.supabase
      .from('conexion')
      .select(`
        solicitante_id,
        destinatario_id,
        solicitante:usuario!conexion_solicitante_id_fkey ( id, nombre_user, nombre, avatar_url ),
        destinatario:usuario!conexion_destinatario_id_fkey ( id, nombre_user, nombre, avatar_url )
      `)
      .eq('estado', 'aceptada')
      .or(`solicitante_id.eq.${usuarioId},destinatario_id.eq.${usuarioId}`);

    if (error) {
      return { data: null, error: error.message };
    }

    // Extraer el perfil del otro participante en cada conexión
    const amigos = (data ?? []).map((conexion: any) => {
      const esSolicitante = conexion.solicitante_id === usuarioId;
      const perfil = esSolicitante ? conexion.destinatario : conexion.solicitante;
      return {
        id:         perfil?.id,
        nombre:     perfil?.nombre_user || perfil?.nombre || 'Usuario',
        avatar_url: perfil?.avatar_url ?? null,
      };
    });

    return { data: amigos, error: null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // UTILIDADES INTERNAS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Genera un slug URL-friendly a partir de un nombre de género.
   *
   * Proceso:
   *  1. Convertir a minúsculas
   *  2. Normalizar acentos (NFD) y eliminar diacríticos (̈\u0300-\u036f)
   *  3. Reemplazar espacios y caracteres especiales por guiones
   *  4. Eliminar guiones repetidos y guiones al inicio/fin
   *
   * Ejemplos:
   *  "Acción"        → "accion"
   *  "Ciencia ficción" → "ciencia-ficcion"
   *  "Romance"       → "romance"
   *
   * @param nombre Nombre del género (ej: "Acción", "Drama")
   * @returns Slug normalizado (ej: "accion", "drama")
   */
  private generarSlug(nombre: string): string {
    if (!nombre) return '';
    return nombre
      .toLowerCase()
      .normalize('NFD')                      // Separar letras de sus acentos
      .replace(/[\u0300-\u036f]/g, '')       // Eliminar marcas diacríticas
      .replace(/[^a-z0-9\s-]/g, '')          // Mantener solo alfanuméricos y espacios
      .trim()
      .replace(/\s+/g, '-')                  // Espacios → guiones
      .replace(/-+/g, '-');                  // Colapsar guiones múltiples
  }
}
