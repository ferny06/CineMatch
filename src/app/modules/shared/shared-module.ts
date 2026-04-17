import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FooterNavComponent } from '../../components/footer-nav/footer-nav.component';

@NgModule({
  declarations: [FooterNavComponent], // se declara
  imports: [
    CommonModule,
    IonicModule
  ],
  exports: [FooterNavComponent] // se exporta para que otros lo usen
})
export class SharedModule { }