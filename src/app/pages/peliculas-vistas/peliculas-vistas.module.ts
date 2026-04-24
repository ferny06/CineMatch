import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PeliculasVistasPageRoutingModule } from './peliculas-vistas-routing.module';

import { PeliculasVistasPage } from './peliculas-vistas.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PeliculasVistasPageRoutingModule,
    PeliculasVistasPage
  ]
})
export class PeliculasVistasPageModule {}
