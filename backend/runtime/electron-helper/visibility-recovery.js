'use strict';
// Shared by the real visibility path and offline tests. Reinstall the mouse
// hook even when the cached ignore flag happens to equal the desired value.
function resetWindowInput(win, maps, setIgnore) {
  for (const map of maps) map.delete(win.id);
  setIgnore(win, false);
  setIgnore(win, true);
  win.setFocusable(false);
}
function transitionWindow(win, visible, {reset, notify, geometry, health}) {
  if (win.isDestroyed() || visible === win.isVisible()) return false;
  reset(win);
  if (!visible) { notify(win, 'suspend'); win.hide(); }
  else {
    win.showInactive();
    geometry(win);
    notify(win, 'resume');
    health(win);
  }
  return true;
}
module.exports={resetWindowInput,transitionWindow};
