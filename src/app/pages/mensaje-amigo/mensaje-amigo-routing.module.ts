import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { MensajeAmigoPage } from './mensaje-amigo.page';

const routes: Routes = [
  {
    path: '',
    component: MensajeAmigoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MensajeAmigoPageRoutingModule {}
