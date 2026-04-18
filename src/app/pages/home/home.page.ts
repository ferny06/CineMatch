import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { MovieService } from '../../services/movie';
import { GeolocalizacionService } from '../../services/geolocalizacion.service';
import { DatabaseService } from '../../../database/services/database.service';
import { DB_TABLES } from '../../../database/database.constants';


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit {

  peliculas: any[] = [];
  peliculasCopia: any[] = [];
  peliculasRecomendadas: any[] = [];
  peliculasPopulares: any[] = [];
  cargandoRecomendadas = true;
  cargandoPopulares = true;
  buscando = false;
  nombre_user: string = '';

  constructor(
    private movieService: MovieService,
    private geoService: GeolocalizacionService,
    private databaseService: DatabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.cargarDatosUsuario();
    await Promise.all([
      this.cargarRecomendadas(),
      this.cargarPopularesPais()
    ]);
  }

  async cargarDatosUsuario(): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const res = await db.query('SELECT nombre_user, nombre FROM local_usuario LIMIT 1');
      const u = res.values?.[0];
      if (u) {
        this.nombre_user = u['nombre_user'] || u['nombre'] || 'Usuario';
      }
    } catch (err) {
      console.error('[HomePage] Error al cargar usuario:', err);
    }
  }

  private async cargarRecomendadas(): Promise<void> {
    try {
      const db = this.databaseService.obtenerConexion();
      const userRes = await db.query('SELECT id FROM local_usuario LIMIT 1');
      const usuarioId = userRes.values?.[0]?.['id'];

      if (usuarioId) {
        const genRes = await db.query(
          `SELECT tmdb_genero_id FROM ${DB_TABLES.PREF_GENERO} WHERE usuario_id = ? ORDER BY peso_pref DESC LIMIT 3`,
          [usuarioId]
        );
        const genreIds: number[] = (genRes.values ?? []).map((r: any) => r['tmdb_genero_id']);

        const reviewedRes = await db.query(
          `SELECT p.tmdb_id FROM ${DB_TABLES.RESENA} r
           JOIN ${DB_TABLES.PELICULA} p ON r.pelicula_id = p.id
           WHERE r.usuario_id = ?`,
          [usuarioId]
        );
        const reviewedIds = new Set<number>(
          (reviewedRes.values ?? []).map((r: any) => r['tmdb_id']).filter(Boolean)
        );

        if (genreIds.length > 0) {
          const data = await firstValueFrom(this.movieService.getMoviesByGenres(genreIds));
          this.peliculasRecomendadas = data.results
            .filter((peli: any) => !reviewedIds.has(peli.id))
            .slice(0, 10);
          return;
        }
      }

      // Fallback: usuario nuevo sin reseñas
      const data = await firstValueFrom(this.movieService.getPopularMovies());
      this.peliculasRecomendadas = data.results.slice(0, 10);
      this.peliculas = data.results;
      this.peliculasCopia = data.results;
    } catch (err) {
      console.error('[HomePage] Error al cargar recomendadas:', err);
      try {
        const data = await firstValueFrom(this.movieService.getPopularMovies());
        this.peliculasRecomendadas = data.results.slice(0, 10);
        if (this.peliculasCopia.length === 0) {
          this.peliculas = data.results;
          this.peliculasCopia = data.results;
        }
      } catch {}
    } finally {
      this.cargandoRecomendadas = false;
    }
  }

  private async cargarPopularesPais(): Promise<void> {
    try {
      const ubicacion = await this.geoService.obtenerUbicacion();
      if (ubicacion.ok) {
        const codigoPais = await this.geoService.obtenerCodigoPais(
          ubicacion.coordenadas.latitud,
          ubicacion.coordenadas.longitud
        );
        if (codigoPais) {
          const data = await firstValueFrom(this.movieService.getPopularMoviesByRegion(codigoPais));
          this.peliculasPopulares = data.results.slice(0, 10);
          return;
        }
      }

      // Fallback: GPS denegado o geocoding falló
      const data = await firstValueFrom(this.movieService.getPopularMovies());
      this.peliculasPopulares = data.results.slice(0, 10);
    } catch (err) {
      console.error('[HomePage] Error al cargar populares por país:', err);
      try {
        const data = await firstValueFrom(this.movieService.getPopularMovies());
        this.peliculasPopulares = data.results.slice(0, 10);
      } catch {}
    } finally {
      this.cargandoPopulares = false;
    }
  }

  buscarPelicula(event: any) {
    const texto = event.detail.value?.trim();

    if (!texto || texto.length === 0) {
      this.buscando = false;
      this.peliculas = this.peliculasCopia;
      return;
    }

    this.buscando = true;
    this.movieService.searchMovies(texto).subscribe({
      next: (data: any) => {
        this.peliculas = data.results;
      },
      error: (err) => {
        console.error('Error en búsqueda:', err);
      }
    });
  }

  irAPerfil() {
    this.router.navigate(['/perfil']);
  }

  irAHome() {
    this.router.navigate(['/home']);
    this.buscando = false;
    this.peliculas = [...this.peliculasCopia];
  }

  verDetalle(peliculaId: number) {
    this.router.navigate(['/pelicula', peliculaId]);
  }

  irAMisListas() {
    this.router.navigate(['/mis-listas']);
  }

  irASugerencias() {
    this.router.navigate(['/sugerencias']);
  }

  irAMensajes() {
    this.router.navigate(['/mensajes']);
  }

  irARanking() {
    this.router.navigate(['/ranking']);
  }
}
