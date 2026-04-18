import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PerfilAmigoPageRoutingModule } from './perfil-amigo-routing.module';
import { SharedModule } from 'src/app/modules/shared/shared-module';

import { PerfilAmigoPage } from './perfil-amigo.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PerfilAmigoPageRoutingModule,
    SharedModule,
  ],
  declarations: [PerfilAmigoPage]
})
export class PerfilAmigoPageModule {}
