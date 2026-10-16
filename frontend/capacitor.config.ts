import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stakhovivan.stovo',
  appName: 'Stovo',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
