import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'CineMatch',
  webDir: 'www',
  plugins: {
    // Configuración del plugin SQLite para cada plataforma
    CapacitorSQLite: {
      // Android: sin cifrado
      androidIsEncryption: false,
      // iOS: ubicación de los archivos de BD en el sandbox de la app
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
    }
  }
};

export default config;
