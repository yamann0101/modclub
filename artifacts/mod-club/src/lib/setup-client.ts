export type PublicSetup = {
  installed: boolean;
  clubName: string;
  theme: string;
};

export { fetchPublicSetup, saveServerSetup } from './club-api';
