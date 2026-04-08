import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MisListasPageRoutingModule } from './mis-listas-routing.module';

import { MisListasPage } from './mis-listas.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MisListasPageRoutingModule
  ],
  declarations: [MisListasPage]
})
export class MisListasPageModule {}
