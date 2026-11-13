import config from './account-config.js';
if (config.enabled) {
  const { startAccounts } = await import('./accounts.js');
  await startAccounts(config);
} else {
  await import('./app.js');
}
