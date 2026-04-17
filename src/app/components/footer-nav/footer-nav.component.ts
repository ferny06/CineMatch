import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-footer-nav',
  templateUrl: './footer-nav.component.html',
  styleUrls: ['./footer-nav.component.scss'],
  standalone: false
})
export class FooterNavComponent {
  // para saber que boton pintar amarillo
  @Input() activo: string = '';

  constructor(private router: Router) {}

  navegar(ruta: string) {
    this.router.navigate([`/${ruta}`]);
  }
}