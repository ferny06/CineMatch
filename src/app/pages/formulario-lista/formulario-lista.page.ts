import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from '../../../database/services/database.service';
import { ColaService } from '../../services/cola.service';
import { MovieService } from '../../services/movie';
import { DB_TABLES, SYNC_OPERACION } from '../../../database/database.constants';

@Component({
  selector: 'app-formulario-lista',
  templateUrl: './formulario-lista.page.html',
  styleUrls: ['./formulario-lista.page.scss'],
  standalone: false,
})
export class FormularioListaPage implements OnInit {

  nombre = '';
  descripcion = '';

  peliculasAgregadas: any[] = [];
  resultadosBusqueda: any[] = [];
  buscando = false;
  guardando = false;

  private usuarioId = '';

  constructor(
    private databaseService: DatabaseService,
    private colaService: ColaService,
    private movieService: MovieService,
    private router: Router,
  ) {}

  async ngOnInit() {
    try {
      const db = this.databaseService.obtenerConexion();
      const res = await db.query('SELECT id FROM local_usuario LIMIT 1');
      this.usuarioId = res.values?.[0]?.id ?? '';
    } catch (err) {
      console.error('[FormularioLista] Error al obtener usuario:', err);
    }
  }

  buscarPelicula(event: any) {
    const texto = event.detail.value?.trim();
    if (!texto || texto.length < 2) {
      this.buscando = false;
      this.resultadosBusqueda = [];
      return;
    }
    this.buscando = true;
    this.movieService.searchMovies(texto).subscribe({
      next: (data: any) => {
        this.resultadosBusqueda = data.results.slice(0, 20);
      },
      error: (err) => console.error('[FormularioLista] Error búsqueda:', err),
    });
  }

  estaAgregada(tmdbId: number): boolean {
    return this.peliculasAgregadas.some(p => p.id === tmdbId);
  }

  agregarPelicula(pelicula: any) {
    if (!this.estaAgregada(pelicula.id)) {
      this.peliculasAgregadas.push(pelicula);
    }
  }

  quitarPelicula(tmdbId: number) {
    this.peliculasAgregadas = this.peliculasAgregadas.filter(p => p.id !== tmdbId);
  }

  get puedeGuardar(): boolean {
    return this.nombre.trim().length > 0 && this.peliculasAgregadas.length > 0;
  }

  async guardarLista() {
    if (!this.puedeGuardar || this.guardando) return;
    this.guardando = true;
    try {
      const db = this.databaseService.obtenerConexion();
      const localId = crypto.randomUUID();
      const ahora = new Date().toISOString();
      const tmdbIds = this.peliculasAgregadas.map(p => p.id);

      await db.run(
        `INSERT INTO ${DB_TABLES.LISTA}
           (local_id, usuario_id, nombre, descripcion, peliculas_ids, estado, sync_status, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          localId,
          this.usuarioId,
          this.nombre.trim(),
          this.descripcion.trim() || null,
          JSON.stringify(tmdbIds),
          'activa',
          'pending',
          ahora,
        ]
      );

      await this.colaService.encolar(DB_TABLES.LISTA, localId, SYNC_OPERACION.INSERT);
      this.router.navigate(['/mis-listas']);
    } catch (err) {
      console.error('[FormularioLista] Error al guardar lista:', err);
      this.guardando = false;
    }
  }

  posterUrl(posterPath: string | null): string {
    if (!posterPath) return 'assets/icon/no-poster.png';
    return `https://image.tmdb.org/t/p/w185${posterPath}`;
  }
}
