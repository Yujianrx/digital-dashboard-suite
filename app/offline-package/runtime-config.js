// The Node host replaces this response with its deployment settings.
// The static build replaces it with browser storage settings and an empty seed.
window.DashboardRuntime = {
  mode: 'local', storage: 'server',
  basePath: new URL('.', document.currentScript.src).pathname
};
