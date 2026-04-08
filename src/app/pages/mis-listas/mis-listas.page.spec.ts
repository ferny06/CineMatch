import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MisListasPage } from './mis-listas.page';

describe('MisListasPage', () => {
  let component: MisListasPage;
  let fixture: ComponentFixture<MisListasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MisListasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
