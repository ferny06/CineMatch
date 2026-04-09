import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CrearResenaPageRoutingModule } from './crear-resena-routing.module';

import { CrearResenaPage } from './crear-resena.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CrearResenaPageRoutingModule
  ],
  declarations: [CrearResenaPage]
})
export class CrearResenaPageModule {}
