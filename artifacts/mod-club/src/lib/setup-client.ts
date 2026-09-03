export type PublicSetup = {
  installed: boolean;
  clubName: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
  theme: string;
};

export { fetchPublicSetup, saveServerSetup } from './club-api';
