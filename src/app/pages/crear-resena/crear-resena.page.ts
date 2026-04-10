import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-crear-resena',
  templateUrl: './crear-resena.page.html',
  styleUrls: ['./crear-resena.page.scss'],
  standalone: false
})
export class CrearResenaPage implements OnInit {

  // se define objeto resena
  resena = {
    local_id: null,
    server_id: null,
    usuario_id: 'user_06',
    pelicula_id: '',
    calificacion: 0,
    comentario: '',
    tiene_spoiler: false,
    sync_status: 0,
    created_at: ''
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private alertController: AlertController
  ) { }

  ngOnInit() {
    // captura el id de la película que viene en la ruta
    const peliId = this.route.snapshot.paramMap.get('id');
    if (peliId) {
      this.resena.pelicula_id = peliId;
    }
  }

  //  funcion 'setRating' 
  setRating(val: number) {
    this.resena.calificacion = val;
  }

  // para guardar
async guardar() {
  // validacion: si califacion es es 0 (no seleccionó ninguna strella), muestra una advertencia
  if (this.resena.calificacion === 0) {
    const alert = await this.alertController.create({
      header: 'Falta información',
      message: 'Por favor, selecciona al menos una estrella para calificar la película.',
      buttons: ['OK']
    });

    await alert.present();
    return; //para q el codigo de abajo no se ejecute
  }

  // si pasa la validación, seguimos con el guardado normal
  this.resena.created_at = new Date().toISOString();
  
  const dbData = {
    ...this.resena,
    comentario: this.resena.comentario || '', 
    tiene_spoiler: this.resena.tiene_spoiler ? 'S' : 'N'
  };

  console.log('Enviando reseña validada:', dbData);
  this.router.navigate(['/pelicula', this.resena.pelicula_id]);
}
}