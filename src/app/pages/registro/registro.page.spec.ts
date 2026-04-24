import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { RegistroPage } from './registro.page';
import { DatabaseService } from '../../../database/services/database.service';
import { ColaService } from '../../services/cola.service';
import { SupabaseService } from '../../services/supabase.service';

describe('RegistroPage (Pruebas de Lógica y QA)', () => {
  let component: RegistroPage;
  let fixture: ComponentFixture<RegistroPage>;

  const mockDb = { obtenerConexion: () => ({ run: () => Promise.resolve() }) };
  const mockCola = { encolar: () => Promise.resolve() };
  const mockSupa = { 
    signUp: () => Promise.resolve({ data: { authUserId: 'uuid-123' }, error: null }),
    upsertUsuario: () => Promise.resolve({ error: null })
  };

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ RegistroPage ],
      imports: [IonicModule.forRoot(), FormsModule, RouterTestingModule],
      providers: [
        { provide: DatabaseService, useValue: mockDb },
        { provide: ColaService, useValue: mockCola },
        { provide: SupabaseService, useValue: mockSupa }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RegistroPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('debería mostrar alerta si hay campos obligatorios vacíos', async () => {
    spyOn(window, 'alert');
    component.userPost.nombre = ''; 
    await component.registrar();
    expect(window.alert).toHaveBeenCalledWith("Error: todos los campos son obligatorios.");
  });

  it('debería validar que el email tenga un formato correcto', async () => {
    spyOn(window, 'alert');
    // Llenamos datos para pasar la primera validación
    component.userPost.nombre_user = 'fer123';
    component.userPost.nombre = 'Fernanda';
    component.userPost.apellido_1 = 'Irarrazabal';
    component.userPost.apellido_2 = 'Zeta';
    component.userPost.fecha_nacimiento = '1993-06-16';
    component.userPost.genero = 'Femenino';
    component.userPost.password = 'Pass123';
    component.userPost.email = 'correo-invalido'; 
    
    await component.registrar();
    expect(window.alert).toHaveBeenCalledWith("Por favor, ingresa un correo electrónico válido (ejemplo@correo.com).");
  });

  it('debería rechazar contraseñas que no cumplan la seguridad (letras y números)', async () => {
    spyOn(window, 'alert');
    // Llenamos datos previos
    component.userPost.nombre_user = 'fer123';
    component.userPost.nombre = 'Fernanda';
    component.userPost.apellido_1 = 'Irarrazabal';
    component.userPost.apellido_2 = 'Zeta';
    component.userPost.fecha_nacimiento = '1995-01-01';
    component.userPost.genero = 'Femenino';
    component.userPost.email = 'fer@test.com';

    // Password insegura (solo letras)
    component.userPost.password = 'abcdef'; 
    component.userPost.confirm_password = 'abcdef';
    
    await component.registrar();
    expect(window.alert).toHaveBeenCalledWith("La contraseña debe tener al menos 6 caracteres e incluir letras y números.");
  });

  it('debería mostrar error si las contraseñas no coinciden', async () => {
    spyOn(window, 'alert');
    // Llenamos datos para llegar hasta la validación de coincidencia
    component.userPost.nombre_user = 'fer123';
    component.userPost.nombre = 'Fernanda';
    component.userPost.apellido_1 = 'Irarrazabal';
    component.userPost.apellido_2 = 'Zeta';
    component.userPost.fecha_nacimiento = '1995-01-01';
    component.userPost.genero = 'Femenino';
    component.userPost.email = 'fer@test.com';
    
    component.userPost.password = 'Clave123';
    component.userPost.confirm_password = 'Password999';
    
    await component.registrar();
    expect(window.alert).toHaveBeenCalledWith("Las contraseñas no coinciden.");
  });
});