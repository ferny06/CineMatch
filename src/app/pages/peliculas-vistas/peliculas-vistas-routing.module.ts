import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PeliculasVistasPage } from './peliculas-vistas.page';

const routes: Routes = [
  {
    path: '',
    component: PeliculasVistasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PeliculasVistasPageRoutingModule {}
