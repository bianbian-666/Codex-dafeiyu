const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petGame',{
  init:()=>ipcRenderer.invoke('pet:game-init'),
  position:value=>ipcRenderer.send('pet:game-position',value),
  exit:value=>ipcRenderer.send('pet:game-exit',value),
});
