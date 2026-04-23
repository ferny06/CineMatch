import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { LoginPage } from './login.page';
import { SupabaseService } from '../../services/supabase.service';
import { DatabaseService } from '../../../database/services/database.service';
import { PullSyncService } from '../../services/pull-sync.service';

describe('LoginPage (Pruebas de Validación y Acceso)', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;

  // Mocks de servicios
  const mockSupabase = { 
    supabase: { auth: { signInWithPassword: () => Promise.resolve({ data: { user: { id: '123' } }, error: null }) } },
    getUsuarioPorAuthId: () => Promise.resolve({ data: { id: '1' }, error: null })
  };
  const mockDb = { 
    obtenerConexion: () => ({ 
      query: () => Promise.resolve({ values: [] }), 
      run: () => Promise.resolve() 
    }) 
  };
  const mockPull = { pullPreferencias: () => Promise.resolve() };

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ LoginPage ],
      imports: [
        IonicModule.forRoot(), 
        FormsModule, 
        RouterTestingModule
      ],
      providers: [
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: DatabaseService, useValue: mockDb },
        { provide: PullSyncService, useValue: mockPull }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('debería tener los campos de login vacíos al iniciar', () => {
    expect(component.loginData.email).toBe('');
    expect(component.loginData.password).toBe('');
  });

  it('debería mostrar una alerta si el email o la contraseña están vacíos', async () => {
    spyOn(window, 'alert');
    component.loginData.email = '';
    component.loginData.password = '';
    
    await component.ingresar();
    
    expect(window.alert).toHaveBeenCalledWith('Por favor, completa los campos');
  });

  it('debería permitir el intento de ingreso si ambos campos tienen datos', async () => {
    spyOn(window, 'alert');
    
    // configuramos con  datos correctos
    component.loginData.email = 'usuariorandom@gmail.com';
    component.loginData.password = 'Seba123.';

    // Ejecutamos la funcion
    await component.ingresar();
    
    // Verificamos que NO saltó la alerta de error de campos
    expect(window.alert).not.toHaveBeenCalledWith('Por favor, completa los campos');
  });
});