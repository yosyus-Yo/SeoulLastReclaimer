import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePanelShortcut } from '../src/panel-shortcuts.js';

function key(code, overrides = {}) {
  return { code, target: { closest: () => null }, prevented: false,
    preventDefault() { this.prevented = true; }, ...overrides };
}
test('J opens, closes with focus inside its dialog, and opens again', () => {
  const journal = {}; let open = false;
  const bindings = { KeyJ: { dialog: journal, toggle: () => { open = !open; } } };
  for (const expected of [true, false, true, false]) {
    const event = key('KeyJ');
    assert.equal(handlePanelShortcut(event, bindings, open ? journal : null), true);
    assert.equal(open, expected); assert.equal(event.prevented, true);
  }
});
test('all registered panel keys follow the same toggle and repeat rule', () => {
  for (const code of ['KeyJ', 'KeyP', 'Escape', 'KeyI']) {
    let count = 0;
    const bindings = { [code]: { toggle: () => count++ } };
    handlePanelShortcut(key(code), bindings);
    handlePanelShortcut(key(code, { repeat: true }), bindings);
    handlePanelShortcut(key(code), bindings);
    assert.equal(count, 2);
  }
});
test('another modal blocks panel toggles but its own shortcut can close it', () => {
  const journal = {}, settings = {}, confirmation = {}; let count = 0;
  const bindings = { KeyJ: { dialog: journal, toggle: () => count++ }, KeyP: { toggle: () => count++ }, Escape: { dialog: settings, toggle: () => count++ } };
  for (const code of ['KeyJ', 'KeyP', 'Escape']) assert.equal(handlePanelShortcut(key(code), bindings, confirmation), false);
  assert.equal(handlePanelShortcut(key('KeyJ'), bindings, settings), false);
  assert.equal(handlePanelShortcut(key('Escape'), bindings, settings), true);
  assert.equal(count, 1);
});
test('typing, IME composition and browser shortcuts are not intercepted', () => {
  const bindings = { KeyJ: { toggle: () => assert.fail('must not toggle') } };
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { target: { isContentEditable: true } }, { target: { closest: () => ({ tagName: 'INPUT' }) } }]) {
    const event = key('KeyJ', overrides);
    assert.equal(handlePanelShortcut(event, bindings), false);
    assert.equal(event.prevented, false);
  }
  assert.equal(handlePanelShortcut(key('KeyW'), bindings), false);
});
