import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { DatabaseService } from '../../../database/services/database.service';
import { DB_TABLES, SYNC_STATUS } from '../../../database/database.constants';
import { SupabaseService } from '../../services/supabase.service';

interface GrupoGenero {
  genero: string;
  peliculas: any[];
}

@Component({
  selector: 'app-peliculas-vistas',
  templateUrl: './peliculas-vistas.page.html',
  styleUrls: ['./peliculas-vistas.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class PeliculasVistasPage {

  grupos: GrupoGenero[] = [];
  cargando = true;

  constructor(
    private databaseService: DatabaseService,
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  async ionViewWillEnter() {
    this.cargando = true;
    await this.pullVistas();
    await this.cargarVistas();
  }

  private async pullVistas(): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const userRes = await db.query('SELECT id FROM local_usuario LIMIT 1');
      const usuarioId = userRes.values?.[0]?.id;
      if (!usuarioId) return;

      const { data, error } = await this.supabaseService.pullPeliculasVistas(usuarioId);
      if (error || !data?.length) return;

      const ahora = new Date().toISOString();
      for (const v of data) {
        const peli = v.pelicula;
        if (!peli?.tmdb_id) continue;

        // Extraer géneros del resultado de Supabase
        const generosSupabase: string[] = (peli.pelicula_genero ?? [])
          .map((pg: any) => pg.genero?.nombre)
          .filter(Boolean);
        const generoPrincipal: string | null = generosSupabase[0] ?? null;
        const generosJson = JSON.stringify(
          generosSupabase.map((nombre: string) => ({ nombre }))
        );

        let localPeli = await db.query(
          'SELECT id FROM local_pelicula WHERE tmdb_id = ?',
          [peli.tmdb_id]
        );
        if (!localPeli.values?.length) {
          const newPeliculaId = crypto.randomUUID();
          await db.run(
            `INSERT OR IGNORE INTO local_pelicula (id, tmdb_id, titulo, poster_url, generos_json, synced_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [newPeliculaId, peli.tmdb_id, peli.titulo, peli.poster_url ?? null, generosJson, ahora]
          );
          localPeli = await db.query(
            'SELECT id FROM local_pelicula WHERE tmdb_id = ?',
            [peli.tmdb_id]
          );
        } else if (generosSupabase.length) {
          await db.run(
            'UPDATE local_pelicula SET generos_json = ? WHERE tmdb_id = ?',
            [generosJson, peli.tmdb_id]
          );
        }
        if (!localPeli.values?.length) continue;

        const peliculaId = localPeli.values[0].id;

        const existing = await db.query(
          `SELECT local_id FROM ${DB_TABLES.PELICULA_VISTA} WHERE server_id = ?`,
          [v.id]
        );
        if (existing.values?.length) {
          await db.run(
            `UPDATE ${DB_TABLES.PELICULA_VISTA} SET fecha_vista = ?, genero_principal = ?, synced_at = ? WHERE server_id = ?`,
            [v.fecha_vista, generoPrincipal, ahora, v.id]
          );
        } else {
          const conflicto = await db.query(
            `SELECT local_id FROM ${DB_TABLES.PELICULA_VISTA} WHERE usuario_id = ? AND tmdb_id = ?`,
            [usuarioId, peli.tmdb_id]
          );
          if (conflicto.values?.length) {
            await db.run(
              `UPDATE ${DB_TABLES.PELICULA_VISTA} SET server_id = ?, genero_principal = ?, sync_status = ?, synced_at = ? WHERE local_id = ?`,
              [v.id, generoPrincipal, SYNC_STATUS.SYNCED, ahora, conflicto.values[0].local_id]
            );
          } else {
            await db.run(
              `INSERT INTO ${DB_TABLES.PELICULA_VISTA}
                (local_id, server_id, usuario_id, pelicula_id, tmdb_id, titulo, poster_url, genero_principal, fecha_vista, sync_status, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [crypto.randomUUID(), v.id, usuarioId, peliculaId,
               peli.tmdb_id, peli.titulo, peli.poster_url ?? null,
               generoPrincipal, v.fecha_vista, SYNC_STATUS.SYNCED, ahora]
            );
          }
        }
      }
    } catch (err) {
      console.warn('[PeliculasVistasPage] pullVistas error:', err);
    }
  }

  private async cargarVistas(): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const userRes = await db.query('SELECT id FROM local_usuario LIMIT 1');
      const usuarioId = userRes.values?.[0]?.id;
      if (!usuarioId) return;

      const res = await db.query(
        `SELECT tmdb_id, titulo, poster_url, genero_principal, fecha_vista
         FROM ${DB_TABLES.PELICULA_VISTA}
         WHERE usuario_id = ?
         ORDER BY fecha_vista DESC`,
        [usuarioId]
      );

      const peliculas: any[] = res.values ?? [];

      // Agrupar por genero_principal
      const mapaGeneros = new Map<string, any[]>();
      for (const peli of peliculas) {
        const genero = peli.genero_principal || 'Sin género';
        if (!mapaGeneros.has(genero)) {
          mapaGeneros.set(genero, []);
        }
        mapaGeneros.get(genero)!.push(peli);
      }

      this.grupos = Array.from(mapaGeneros.entries()).map(([genero, pelis]) => ({
        genero,
        peliculas: pelis,
      }));
    } catch (err) {
      console.error('[PeliculasVistasPage] Error al cargar vistas:', err);
    } finally {
      this.cargando = false;
    }
  }

  verDetalle(tmdbId: number) {
    this.router.navigate(['/pelicula', tmdbId]);
  }
}
