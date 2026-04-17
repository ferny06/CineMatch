import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SugerenciasPageRoutingModule } from './sugerencias-routing.module';

import { SugerenciasPage } from './sugerencias.page';
import { SharedModule } from 'src/app/modules/shared/shared-module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SugerenciasPageRoutingModule,
    SharedModule
  ],
  declarations: [SugerenciasPage]
})
export class SugerenciasPageModule {}
