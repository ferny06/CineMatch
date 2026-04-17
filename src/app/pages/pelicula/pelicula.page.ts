import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MovieService } from '../../services/movie';
import { DatabaseService } from '../../../database/services/database.service';
import { ColaService } from '../../services/cola.service';
import { DB_TABLES, SYNC_OPERACION } from '../../../database/database.constants';

@Component({
  selector: 'app-pelicula',
  templateUrl: './pelicula.page.html',
  styleUrls: ['./pelicula.page.scss'],
  standalone: false
})
export class PeliculaPage implements OnInit {

  peli: any = {
    id: '',
    tmdb_id: 0,
    titulo: 'Cargando...',
    sinopsis: '',
    fecha_estreno: '',
    poster_url: '',
    duracion_min: 0,
    promedio_votos: 0,
    idioma_original: '',
    generos_json: ''
  };

  constructor(
    private route: ActivatedRoute,
    private movieService: MovieService,
    private router: Router,
    private databaseService: DatabaseService,
    private colaService: ColaService,
  ) { }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.cargarDetallesPelicula(id);
    }
  }

  /**
   * Obtiene los detalles de la película desde TMDB, los guarda en local_pelicula
   * y los encola para sincronizar con Supabase.
   * Usa firstValueFrom para convertir el Observable a Promise y evitar el patrón
   * "async en subscribe" que ignora errores silenciosamente.
   */
  async cargarDetallesPelicula(id: string) {
    try {
      const res: any = await firstValueFrom(this.movieService.getMovieById(id));

      this.peli = {
        id: res.id.toString(),
        tmdb_id: res.id,
        titulo: res.title,
        sinopsis: res.overview,
        fecha_estreno: res.release_date,
        poster_url: 'https://image.tmdb.org/t/p/w500' + res.poster_path,
        duracion_min: res.runtime,
        promedio_votos: res.vote_average,
        idioma_original: res.original_language,
        generos_json: JSON.stringify(
          (res.genres ?? []).map((g: any) => ({ id: g.id, nombre: g.name }))
        )
      };

      console.log('[PeliculaPage] Datos mapeados:', this.peli);

      await this.guardarPeliculaLocal();

    } catch (err) {
      console.error('[PeliculaPage] Error al cargar detalles:', err);
    }
  }

  /**
   * Inserta la película en local_pelicula si no existe aún (idempotente por tmdb_id).
   * Luego la encola para sincronizar con Supabase.
   */
  private async guardarPeliculaLocal(): Promise<void> {
    const db = this.databaseService.obtenerConexion();

    // Verificar si ya existe por tmdb_id
    const existe = await db.query(
      'SELECT id FROM local_pelicula WHERE tmdb_id = ?',
      [this.peli.tmdb_id]
    );

    if (existe.values && existe.values.length > 0) {
      // Ya existe localmente: reutilizar UUID y actualizar generos_json con datos frescos de TMDB.
      // Crítico: si generos_json era null (película cacheada antes de que se implementara el campo),
      // GeneroPreferenciaService retornaría temprano sin crear preferencias de género.
      this.peli.id = existe.values[0].id;
      await db.run(
        `UPDATE local_pelicula SET generos_json = ?, synced_at = ? WHERE id = ?`,
        [this.peli.generos_json ?? null, new Date().toISOString(), this.peli.id]
      );
      console.log('[PeliculaPage] Película ya en local_pelicula — generos_json actualizado, id:', this.peli.id);
    } else {
      // Nueva película: generar UUID e insertar
      const localId = crypto.randomUUID();
      this.peli.id = localId;
      const ahora = new Date().toISOString();

      await db.run(
        `INSERT INTO local_pelicula
           (id, tmdb_id, titulo, sinopsis, poster_url, fecha_estreno,
            duracion_min, promedio_votos, idioma_original, generos_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localId,
          this.peli.tmdb_id,
          this.peli.titulo,
          this.peli.sinopsis        ?? null,
          this.peli.poster_url      ?? null,
          this.peli.fecha_estreno   ?? null,
          this.peli.duracion_min    ?? null,
          this.peli.promedio_votos  ?? null,
          this.peli.idioma_original ?? null,
          this.peli.generos_json    ?? null,
          ahora,
        ]
      );

      console.log('[PeliculaPage] Película guardada en local_pelicula, id:', localId);
    }

    // Encolar para sincronizar con Supabase (INSERT es idempotente por tmdb_id en upsertPelicula)
    await this.colaService.encolar(DB_TABLES.PELICULA, this.peli.id, SYNC_OPERACION.INSERT);
  }

  irAEscribirResena() {
    this.router.navigate(['/crear-resena', this.peli.tmdb_id]);
  }
}
