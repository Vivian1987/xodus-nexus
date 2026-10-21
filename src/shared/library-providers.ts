export const libraryProviders = [
  { id: 'steam', name: 'Steam', site: 'https://store.steampowered.com/about/' },
  { id: 'epic', name: 'Epic Games Store', site: 'https://store.epicgames.com/download' },
  { id: 'gog', name: 'GOG', site: 'https://www.gog.com/galaxy' },
  { id: 'ea', name: 'EA app', site: 'https://www.ea.com/ea-app' },
  { id: 'ubisoft', name: 'Ubisoft Connect', site: 'https://www.ubisoft.com/ubisoft-connect' },
  { id: 'battlenet', name: 'Battle.net', site: 'https://download.battle.net/' },
] as const;
export type LibraryProviderId = typeof libraryProviders[number]['id'];
/** Desktop-entry registration only; this does not verify sign-in or import games. */
export interface LibraryProviderStatus { id: LibraryProviderId; installed: boolean; }
export const xboxExtensions = [
  { id: 'ea', name: 'EA app' }, { id: 'ubisoft', name: 'Ubisoft Connect' },
  { id: 'battlenet', name: 'Battle.net' }, { id: 'riot', name: 'Riot Client' },
] as const;
