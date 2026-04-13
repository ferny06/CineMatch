import { Component, OnInit } from '@angular/core';
import { DatabaseService } from '../../../database/services/database.service';

@Component({
  selector: 'app-ranking',
  templateUrl: './ranking.page.html',
  styleUrls: ['./ranking.page.scss'],
  standalone: false,
})
export class RankingPage implements OnInit {

  resenasVistas: any[] = [];
  modalAbierto: boolean = false;
  resenaSeleccionada: any = null;
  private usuarioId: string = '';

  constructor(private databaseService: DatabaseService) {}

  ngOnInit() {}

  async ionViewWillEnter() {
    try {
      const db = this.databaseService.obtenerConexion();

      const userRes = await db.query('SELECT id FROM local_usuario LIMIT 1');
      if (userRes.values && userRes.values.length > 0) {
        this.usuarioId = userRes.values[0].id;
      }

      const res = await db.query(`
        SELECT
          r.local_id,
          r.calificacion,
          r.comentario,
          r.tiene_spoiler,
          r.sync_status,
          r.created_at,
          p.tmdb_id   AS pelicula_id,
          p.titulo,
          p.poster_url
        FROM local_resena r
        JOIN local_pelicula p ON p.id = r.pelicula_id
        WHERE r.usuario_id = ?
        ORDER BY r.created_at DESC
      `, [this.usuarioId]);

      this.resenasVistas = res.values ?? [];
    } catch (err) {
      console.error('[RankingPage] Error al cargar reseñas:', err);
      this.resenasVistas = [];
    }
  }

  abrirModal(resena: any) {
    this.resenaSeleccionada = resena;
    this.modalAbierto = true;
  }

  cerrarModal() {
    this.modalAbierto = false;
    this.resenaSeleccionada = null;
  }
}
