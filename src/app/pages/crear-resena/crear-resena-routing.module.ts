import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CrearResenaPage } from './crear-resena.page';

const routes: Routes = [
  {
    path: '',
    component: CrearResenaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CrearResenaPageRoutingModule {}
