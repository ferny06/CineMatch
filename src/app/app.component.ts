import { Component, OnInit } from '@angular/core';
import { DatabaseService } from 'src/database/services/database.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {

  constructor(private databaseService: DatabaseService) {}

  /**
   * Inicializa la base de datos local al arrancar la aplicación.
   * Se ejecuta una sola vez, antes de que el usuario interactúe con cualquier página.
   */
  async ngOnInit(): Promise<void> {
    await this.databaseService.inicializar();
  }
}
