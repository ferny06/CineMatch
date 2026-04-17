import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MensajesPageRoutingModule } from './mensajes-routing.module';

import { MensajesPage } from './mensajes.page';

import { SharedModule } from 'src/app/modules/shared/shared-module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MensajesPageRoutingModule,
    SharedModule
  ],
  declarations: [MensajesPage]
})
export class MensajesPageModule {}
