import { Injectable } from '@angular/core';
import { DatabaseService } from '../../database/services/database.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class PullSyncService {

  constructor(
    private supabaseService: SupabaseService,
    private databaseService: DatabaseService,
  ) {}

  async pullResenas(usuarioId: string): Promise<void> {
    const { data, error } = await this.supabaseService.pullResenas(usuarioId);
    if (error || !data?.length) {
      if (error) console.warn('[PullSyncService] pullResenas error:', error);
      return;
    }

    const db = this.databaseService.obtenerConexion();
    const ahora = new Date().toISOString();

    for (const r of data) {
      const pel = r.pelicula;
      const peliculaLocalId = await this.upsertPelicula(db, pel, ahora);

      const check = await db.query(
        'SELECT local_id FROM local_resena WHERE server_id = ?', [r.id]
      );
      if (check.values?.length) {
        await db.run(
          `UPDATE local_resena
           SET calificacion=?, comentario=?, tiene_spoiler=?, synced_at=?
           WHERE server_id=?`,
          [r.calificacion, r.comentario ?? null, r.tiene_spoiler, ahora, r.id]
        );
      } else {
        await db.run(
          `INSERT INTO local_resena
             (local_id, server_id, usuario_id, pelicula_id,
              calificacion, comentario, tiene_spoiler,
              sync_status, synced_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(), r.id, usuarioId, peliculaLocalId,
            r.calificacion, r.comentario ?? null, r.tiene_spoiler,
            'synced', ahora, r.fecha_creacion,
          ]
        );
      }
    }
  }

  async pullListas(usuarioId: string): Promise<void> {
    const { data, error } = await this.supabaseService.pullListas(usuarioId);
    if (error || !data?.length) {
      if (error) console.warn('[PullSyncService] pullListas error:', error);
      return;
    }

    const db = this.databaseService.obtenerConexion();

    for (const l of data) {
      // pelicula_id en Supabase es INTEGER[] (tmdb_ids); serializar a JSON para SQLite
      const peliculasJson = JSON.stringify(l.pelicula_id ?? []);

      const check = await db.query(
        'SELECT local_id FROM local_lista WHERE server_id = ?', [l.id]
      );
      if (check.values?.length) {
        await db.run(
          `UPDATE local_lista
           SET nombre=?, descripcion=?, peliculas_ids=?, estado=?
           WHERE server_id=?`,
          [l.nombre, l.descripcion ?? null, peliculasJson, l.estado, l.id]
        );
      } else {
        await db.run(
          `INSERT INTO local_lista
             (local_id, server_id, usuario_id, nombre, descripcion,
              peliculas_ids, estado, sync_status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(), l.id, usuarioId,
            l.nombre, l.descripcion ?? null, peliculasJson,
            l.estado, 'synced', l.fecha_creacion,
          ]
        );
      }
    }
  }

  async pullPreferencias(usuarioId: string): Promise<void> {
    const { data, error } = await this.supabaseService.pullPreferencias(usuarioId);
    if (error || !data?.length) {
      if (error) console.warn('[PullSyncService] pullPreferencias error:', error);
      return;
    }

    const db = this.databaseService.obtenerConexion();
    const ahora = new Date().toISOString();

    for (const p of data) {
      const tmdbGeneroId: number = p.genero.tmdb_id;
      const nombreGenero: string = p.genero.nombre;

      const check = await db.query(
        'SELECT id FROM local_usuario_genero_preferencia WHERE usuario_id=? AND tmdb_genero_id=?',
        [usuarioId, tmdbGeneroId]
      );
      if (check.values?.length) {
        await db.run(
          `UPDATE local_usuario_genero_preferencia
           SET peso_pref=?, synced_at=?
           WHERE usuario_id=? AND tmdb_genero_id=?`,
          [p.peso_pref, ahora, usuarioId, tmdbGeneroId]
        );
      } else {
        await db.run(
          `INSERT INTO local_usuario_genero_preferencia
             (id, usuario_id, tmdb_genero_id, nombre_genero,
              peso_pref, conteo, sync_status, synced_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            p.id, usuarioId, tmdbGeneroId, nombreGenero,
            p.peso_pref, 1,
            'synced', ahora, p.fecha_creacion_pref,
          ]
        );
      }
    }
  }

  private async upsertPelicula(db: any, pel: any, ahora: string): Promise<string> {
    const check = await db.query(
      'SELECT id FROM local_pelicula WHERE tmdb_id = ?', [pel.tmdb_id]
    );
    if (check.values?.length) {
      await db.run(
        `UPDATE local_pelicula
         SET titulo=?, sinopsis=?, poster_url=?, fecha_estreno=?,
             duracion_min=?, promedio_votos=?, idioma_original=?, synced_at=?
         WHERE tmdb_id=?`,
        [
          pel.titulo, pel.sinopsis ?? null, pel.poster_url ?? null,
          pel.fecha_estreno ?? null, pel.duracion_min ?? null,
          pel.promedio_votos ?? null, pel.idioma_original ?? null,
          ahora, pel.tmdb_id,
        ]
      );
      return check.values[0].id;
    }

    const newId = crypto.randomUUID();
    await db.run(
      `INSERT INTO local_pelicula
         (id, tmdb_id, titulo, sinopsis, poster_url, fecha_estreno,
          duracion_min, promedio_votos, idioma_original, synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        newId, pel.tmdb_id, pel.titulo, pel.sinopsis ?? null,
        pel.poster_url ?? null, pel.fecha_estreno ?? null,
        pel.duracion_min ?? null, pel.promedio_votos ?? null,
        pel.idioma_original ?? null, ahora,
      ]
    );
    return newId;
  }
}
