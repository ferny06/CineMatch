import { Component, OnInit } from '@angular/core';
import { DatabaseService } from '../../../database/services/database.service';

@Component({
  selector: 'app-mis-listas',
  templateUrl: './mis-listas.page.html',
  styleUrls: ['./mis-listas.page.scss'],
  standalone: false,
})
export class MisListasPage implements OnInit {

  listas: any[] = [];
  private usuarioId: string = '';

  /* DATOS DE PRUEBA — comentados, no eliminar
  peliculasGuardadas: any[] = [
    {
      local_id: 'uuid-local-001',
      server_id: 'uuid-serv-999',
      usuario_id: 'user-06',
      pelicula_id: 550,
      estado: 'por_ver',
      sync_status: 'sincronizado',
      created_at: '2026-04-01',
      fecha_visto: null,
      titulo: 'Batman',
      poster_url: 'https://i.pinimg.com/736x/da/2c/a4/da2ca4118b0b27454ccf76f8b6d18f65.jpg'
    }
  ];
  */

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
          l.local_id,
          l.estado,
          l.fecha_visto,
          l.sync_status,
          l.created_at,
          p.tmdb_id   AS pelicula_id,
          p.titulo,
          p.poster_url
        FROM local_lista l
        JOIN local_pelicula p ON p.id = l.pelicula_id
        WHERE l.usuario_id = ?
        ORDER BY l.created_at DESC
      `, [this.usuarioId]);

      this.listas = res.values ?? [];
    } catch (err) {
      console.error('[MisListasPage] Error al cargar listas:', err);
      this.listas = [];
    }
  }

  agregarLista() {
    // inútil por ahora
  }
  
}
