import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PeliculasVistasPage } from './peliculas-vistas.page';

describe('PeliculasVistasPage', () => {
  let component: PeliculasVistasPage;
  let fixture: ComponentFixture<PeliculasVistasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PeliculasVistasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
