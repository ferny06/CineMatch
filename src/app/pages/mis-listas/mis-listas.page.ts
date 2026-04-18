import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from '../../../database/services/database.service';
import { PullSyncService } from '../../services/pull-sync.service';
import { SupabaseService } from '../../services/supabase.service';
import { ColaService } from '../../services/cola.service';
import { MovieService } from '../../services/movie';
import { DB_TABLES, SYNC_OPERACION } from '../../../database/database.constants';

@Component({
  selector: 'app-mis-listas',
  templateUrl: './mis-listas.page.html',
  styleUrls: ['./mis-listas.page.scss'],
  standalone: false,
})
export class MisListasPage {

  misListas: any[] = [];
  listasAmigos: any[] = [];
  cargando = true;

  private usuarioId = '';

  constructor(
    private databaseService: DatabaseService,
    private pullSync: PullSyncService,
    private supabaseService: SupabaseService,
    private colaService: ColaService,
    private movieService: MovieService,
    private router: Router,
  ) {}

  async ionViewWillEnter() {
    this.cargando = true;
    try {
      const db = this.databaseService.obtenerConexion();
      const userRes = await db.query('SELECT id FROM local_usuario LIMIT 1');
      if (userRes.values?.length) {
        this.usuarioId = userRes.values[0].id;
      }

      await this.pullSync.pullListas(this.usuarioId);
      await Promise.all([
        this.cargarMisListas(),
        this.cargarListasAmigos(),
      ]);
    } catch (err) {
      console.error('[MisListasPage] Error al cargar:', err);
    } finally {
      this.cargando = false;
    }
  }

  private async cargarMisListas() {
    const db = this.databaseService.obtenerConexion();
    const res = await db.query(
      `SELECT local_id, nombre, descripcion, peliculas_ids, created_at
       FROM ${DB_TABLES.LISTA}
       WHERE usuario_id = ? AND estado = 'activa'
       ORDER BY created_at DESC`,
      [this.usuarioId]
    );

    const listas = res.values ?? [];
    this.misListas = await Promise.all(listas.map(async (l: any) => {
      const ids: number[] = this.parsearIds(l.peliculas_ids);
      const primerPoster = ids.length > 0 ? await this.obtenerPoster(ids[0]) : null;
      return { ...l, peliculas_ids: ids, primerPoster };
    }));
  }

  private async cargarListasAmigos() {
    if (!this.usuarioId) return;
    const { data: amigos } = await this.supabaseService.obtenerAmigos(this.usuarioId);
    if (!amigos?.length) { this.listasAmigos = []; return; }

    const amigoIds = amigos.map((a: any) =>
      a.solicitante_id === this.usuarioId ? a.destinatario_id : a.solicitante_id
    );

    const { data: listas } = await this.supabaseService.obtenerListasAmigos(amigoIds);
    if (!listas?.length) { this.listasAmigos = []; return; }

    this.listasAmigos = await Promise.all(listas.map(async (l: any) => {
      const ids: number[] = Array.isArray(l.pelicula_id) ? l.pelicula_id : [];
      const primerPoster = ids.length > 0 ? await this.obtenerPoster(ids[0]) : null;
      return { ...l, peliculas_ids: ids, primerPoster };
    }));
  }

  async borrarLista(localId: string) {
    try {
      const db = this.databaseService.obtenerConexion();
      await db.run(
        `UPDATE ${DB_TABLES.LISTA} SET estado='borrada', sync_status='pending' WHERE local_id=?`,
        [localId]
      );
      await this.colaService.encolar(DB_TABLES.LISTA, localId, SYNC_OPERACION.UPDATE);
      this.misListas = this.misListas.filter(l => l.local_id !== localId);
    } catch (err) {
      console.error('[MisListasPage] Error al borrar lista:', err);
    }
  }

  agregarLista() {
    this.router.navigate(['/formulario-lista']);
  }

  private parsearIds(raw: any): number[] {
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  }

  private async obtenerPoster(tmdbId: number): Promise<string | null> {
    try {
      const data: any = await firstValueFrom(this.movieService.getMovieById(String(tmdbId)));
      return data?.poster_path ? `https://image.tmdb.org/t/p/w185${data.poster_path}` : null;
    } catch { return null; }
  }
}
