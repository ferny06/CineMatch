import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { MensajeAmigoPageRoutingModule } from './mensaje-amigo-routing.module';
import { MensajeAmigoPage } from './mensaje-amigo.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MensajeAmigoPageRoutingModule,
  ],
  declarations: [MensajeAmigoPage]
})
export class MensajeAmigoPageModule {}
