import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { FormularioListaPageRoutingModule } from './formulario-lista-routing.module';
import { FormularioListaPage } from './formulario-lista.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FormularioListaPageRoutingModule,
  ],
  declarations: [FormularioListaPage],
})
export class FormularioListaPageModule {}
