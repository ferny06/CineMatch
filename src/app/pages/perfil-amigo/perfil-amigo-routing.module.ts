import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PerfilAmigoPage } from './perfil-amigo.page';

const routes: Routes = [
  {
    path: '',
    component: PerfilAmigoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PerfilAmigoPageRoutingModule {}
