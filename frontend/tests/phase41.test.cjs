const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args); };
const access = require('../src/lib/admin-access.ts');
const clock = require('../src/lib/clock-context.ts');
const property = { id: '11111111-1111-4111-8111-111111111111', code: 'ACTUAL-42', name: 'Actual property', timezone: 'America/New_York' };
const manager = { role: 'MANAGER', companyId: 'company-a', assignedLocationIds: [property.id], permissions: [] };
test('121: real API code and timezone map without invented metadata', () => {
  assert.deepEqual(clock.terminalFromProperty(property), { propertyId: property.id, locationCode: property.code, propertyName: property.name, timezone: property.timezone });
});
test('incomplete and invalid timezone configuration fail closed', () => {
  for (const value of [{ ...property, code: '' }, { ...property, timezone: 'invalid' }]) assert.throws(() => clock.terminalFromProperty(value));
});
test('122: missing, legacy, malformed configuration never pairs a property', () => {
  for (const value of [null, '{}', 'bad json', JSON.stringify({ locationId: property.id })]) assert.equal(clock.readTerminalConfig(value), null);
});
test('saved explicit property survives loading', () => {
  assert.equal(clock.readTerminalConfig(JSON.stringify(clock.terminalFromProperty(property))).propertyId, property.id);
});
test('123: missing, unknown, legacy and WORKER roles fail closed', () => {
  for (const role of [undefined, null, '', 'CLIENT_ADMIN', 'NEW_ROLE', 'WORKER']) {
    assert.equal(access.isAdminRole(role), false);
    assert.equal(access.canOpenAdminRoute({ role }, '/admin'), false);
  }
});
test('all six real admin roles recognized', () => {
  for (const role of access.ROLES.filter(r => r !== 'WORKER')) assert.equal(access.isAdminRole(role), true);
});
test('restricted navigation requires actual permission and selected property scope', () => {
  assert.equal(access.canOpenAdminRoute(manager, '/admin/punches', property.id), false);
  const permitted = { ...manager, permissions: ['TIME_VIEW'] };
  assert.equal(access.canOpenAdminRoute(permitted, '/admin/punches', property.id), true);
  assert.equal(access.canOpenAdminRoute(permitted, '/admin/punches', 'foreign'), false);
  assert.equal(access.canOpenAdminRoute(permitted, '/admin/reports', property.id), true);
  assert.equal(access.canOpenAdminRoute(permitted, '/admin/settings'), false);
});
test('property-specific permissions cannot authorize a different property', () => {
  const user = { ...manager, propertyAccess: [{ propertyId: property.id, permissions: ['PROPERTY_VIEW'] }] };
  assert.equal(access.can(user, 'PROPERTY_VIEW', property.id), true);
  assert.equal(access.can(user, 'PROPERTY_VIEW', 'foreign'), false);
});
test('125: backend timestamp renders overnight date in property timezone', () => {
  const timestamp = '2026-01-02T02:05:06.000Z';
  assert.match(clock.formatPropertyTimestamp(timestamp, 'America/New_York'), /Jan 1, 2026.*09:05:06 PM.*EST/);
  assert.match(clock.formatPropertyTimestamp(timestamp, 'Asia/Tokyo'), /Jan 2, 2026.*11:05:06 AM/);
});
test('126: logout storage cleanup preserves terminal pairing and unrelated keys', () => {
  const entries = new Map(['nexustaff_token', 'nexustaff_user', 'nexustaff-auth-store', 'kiosk_terminal_config', 'preference'].map(k => [k, 'value']));
  access.clearAuthStorage({ removeItem: key => entries.delete(key) });
  assert.deepEqual([...entries.keys()], ['kiosk_terminal_config', 'preference']);
});
test('reset/new interaction invalidates late response generation', () => {
  const generation = new clock.InteractionGeneration();
  const pending = generation.next();
  assert.equal(generation.isCurrent(pending), true);
  generation.next();
  assert.equal(generation.isCurrent(pending), false);
  const nextEmployee = generation.next();
  assert.equal(generation.isCurrent(nextEmployee), true);
  assert.equal(generation.isCurrent(pending), false);
});
// Render production components; stub only external router, API and session dependencies.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let session = { isAuthenticated: true, user: manager };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@/store/use-auth-ready') return { useAuthReady: () => true };
  if (request === '@/store/use-auth-store') return { useAuthStore: () => session };
  if (request === '@/store/use-location-store') return { useLocationStore: () => ({ selectedLocationId: property.id }) };
  if (request === '@/lib/api-client') return { locationsApi: { list: () => { throw new Error('Unexpected API call during rendering'); } } };
  if (request === 'next/navigation') return { useRouter: () => ({ push() {} }) };
  return originalLoad.call(this, request, parent, isMain);
};
const { ReportsView } = require('../src/components/reports/reports-view.tsx');
const Setup = require('../src/app/clock/setup/page.tsx').default;
test('124: unauthorized production reports component denies financial content', () => {
  session = { isAuthenticated: true, user: manager };
  assert.match(renderToStaticMarkup(React.createElement(ReportsView)), /Access Denied/);
});
test('124: permitted report displays unavailable authoritative values without calculated payroll', () => {
  session = { isAuthenticated: true, user: { ...manager, permissions: ['VIEW_PAYROLL'] } };
  const html = renderToStaticMarkup(React.createElement(ReportsView));
  assert.match(html, /Payroll processing and invoicing are not included/);
  assert.doesNotMatch(html, /\$25|Total Pay|<table|Invoices/);
});
test('setup production component requires authenticated authorized administrator', () => {
  session = { isAuthenticated: false, user: null };
  assert.match(renderToStaticMarkup(React.createElement(Setup)), /Administrator sign-in is required/);
  session = { isAuthenticated: true, user: manager };
  assert.match(renderToStaticMarkup(React.createElement(Setup)), /Access Denied/);
});
test('122: authorized initial setup renders save disabled with no auto-paired property', () => {
  session = { isAuthenticated: true, user: { ...manager, permissions: ['PROPERTY_VIEW'] } };
  const html = renderToStaticMarkup(React.createElement(Setup));
  assert.match(html, /<button disabled=""/);
  assert.doesNotMatch(html, /checked=""|ACTUAL-42/);
});
