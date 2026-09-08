// Register future panel shortcuts here through bindings, before gameplay input guards.
export function handlePanelShortcut(event, bindings, activeDialog = null) {
  const binding = bindings[event.code], target = event.target;
  if (!binding || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
  if (target?.isContentEditable || target?.closest?.('input, textarea, select')) return false;
  // Only the foreground dialog's own shortcut may close it. Do not stack modals.
  if (activeDialog && binding.dialog !== activeDialog) return false;
  event.preventDefault();
  if (!event.repeat) binding.toggle();
  return true;
}
