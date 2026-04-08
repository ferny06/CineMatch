import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MisListasPage } from './mis-listas.page';

const routes: Routes = [
  {
    path: '',
    component: MisListasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MisListasPageRoutingModule {}
