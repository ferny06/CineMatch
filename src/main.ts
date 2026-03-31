import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';

import { AppModule } from './app/app.module';

// Registrar el web component <jeep-sqlite> en el navegador.
// Requerido por @capacitor-community/sqlite para soporte en plataforma web.
// En Android/iOS este registro no tiene efecto (el plugin usa SQLite nativa).
jeepSqlite(window);

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
