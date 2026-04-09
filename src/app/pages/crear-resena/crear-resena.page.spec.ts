import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrearResenaPage } from './crear-resena.page';

describe('CrearResenaPage', () => {
  let component: CrearResenaPage;
  let fixture: ComponentFixture<CrearResenaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CrearResenaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
