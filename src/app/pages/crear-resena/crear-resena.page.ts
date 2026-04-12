import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { DatabaseService } from '../../../database/services/database.service';
import { ColaService } from '../../services/cola.service';
import { DB_TABLES, SYNC_STATUS, SYNC_OPERACION } from '../../../database/database.constants';

@Component({
  selector: 'app-crear-resena',
  templateUrl: './crear-resena.page.html',
  styleUrls: ['./crear-resena.page.scss'],
  standalone: false
})
export class CrearResenaPage implements OnInit {

  resena = {
    calificacion: 0,
    comentario: '',
    tiene_spoiler: false,
  };

  // Datos de prueba — deshabilitados
  // usuario_id: 'user_06',
  // local_id: null,
  // server_id: null,
  // pelicula_id: '',
  // sync_status: 0,
  // created_at: ''

  private usuarioId: string = '';
  private peliculaLocalId: string = '';
  private peliculaTmdbId: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController,
    private databaseService: DatabaseService,
    private colaService: ColaService,
  ) { }

  async ngOnInit() {
    const tmdbIdStr = this.route.snapshot.paramMap.get('id');
    if (tmdbIdStr) {
      this.peliculaTmdbId = parseInt(tmdbIdStr, 10);
    }

    try {
      const db = this.databaseService.obtenerConexion();

      // Cargar usuario real desde SQLite
      const userRes = await db.query('SELECT id FROM local_usuario LIMIT 1');
      if (userRes.values && userRes.values.length > 0) {
        this.usuarioId = userRes.values[0].id;
      }

      // Obtener UUID local de la película por tmdb_id
      const pelRes = await db.query(
        'SELECT id FROM local_pelicula WHERE tmdb_id = ?',
        [this.peliculaTmdbId]
      );
      if (pelRes.values && pelRes.values.length > 0) {
        this.peliculaLocalId = pelRes.values[0].id;
      }
    } catch (err) {
      console.error('[CrearResenaPage] Error al cargar datos iniciales:', err);
    }
  }

  setRating(val: number) {
    this.resena.calificacion = val;
  }

  async guardar() {
    // Validación: debe seleccionar al menos una estrella
    if (this.resena.calificacion === 0) {
      const alert = await this.alertController.create({
        header: 'Falta información',
        message: 'Por favor, selecciona al menos una estrella para calificar la película.',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    // Validación: datos de contexto disponibles
    if (!this.usuarioId || !this.peliculaLocalId) {
      const alert = await this.alertController.create({
        header: 'Error',
        message: 'No se pudo identificar el usuario o la película. Vuelve al detalle de la película e inténtalo de nuevo.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    try {
      const db = this.databaseService.obtenerConexion();
      const localId = crypto.randomUUID();
      const ahora = new Date().toISOString();
      const tieneSpoilerStr = this.resena.tiene_spoiler ? 'S' : 'N';

      await db.run(
        `INSERT INTO local_resena
           (local_id, server_id, usuario_id, pelicula_id,
            calificacion, comentario, tiene_spoiler, sync_status, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localId,
          this.usuarioId,
          this.peliculaLocalId,
          this.resena.calificacion,
          this.resena.comentario || null,
          tieneSpoilerStr,
          SYNC_STATUS.PENDING,
          ahora,
        ]
      );

      // Encolar película primero (Tier 1) y luego reseña (Tier 2)
      // SyncService respeta este orden FK-safe al procesar la cola
      await this.colaService.encolar(DB_TABLES.PELICULA, this.peliculaLocalId, SYNC_OPERACION.INSERT);
      await this.colaService.encolar(DB_TABLES.RESENA, localId, SYNC_OPERACION.INSERT);

      console.log('[CrearResenaPage] Reseña guardada:', localId);
      this.router.navigate(['/pelicula', this.peliculaTmdbId]);

    } catch (err) {
      console.error('[CrearResenaPage] Error al guardar reseña:', err);
      const alert = await this.alertController.create({
        header: 'Error',
        message: 'No se pudo guardar la reseña. Inténtalo de nuevo.',
        buttons: ['OK'],
      });
      await alert.present();
    }
  }
}
