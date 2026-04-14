import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PerfilAmigoPage } from './perfil-amigo.page';

describe('PerfilAmigoPage', () => {
  let component: PerfilAmigoPage;
  let fixture: ComponentFixture<PerfilAmigoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PerfilAmigoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
