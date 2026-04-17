import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MisListasPageRoutingModule } from './mis-listas-routing.module';

import { MisListasPage } from './mis-listas.page';

import { FooterNavComponent } from '../../components/footer-nav/footer-nav.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MisListasPageRoutingModule
  ],
  declarations: [MisListasPage, FooterNavComponent]
})
export class MisListasPageModule {}
