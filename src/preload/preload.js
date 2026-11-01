const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('liveTranscriptAPI', {
  init: () => ipcRenderer.invoke('app:init'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  testLlmEngines: (settings) => ipcRenderer.invoke('settings:test-llm', settings),
  refreshModelCatalog: (settings) => ipcRenderer.invoke('settings:refresh-models', settings),
  pickProfileFile: () => ipcRenderer.invoke('profile:pick-file'),
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  newSession: (options) => ipcRenderer.invoke('session:new', options),
  pickSessionParentDir: (defaultDir) => ipcRenderer.invoke('session:pick-parent-dir', defaultDir),
  loadSession: (sessionId) => ipcRenderer.invoke('session:load', sessionId),
  exportSession: (sessionId) => ipcRenderer.invoke('session:export', sessionId),
  openSessionFolder: (sessionId) => ipcRenderer.invoke('session:open-folder', sessionId),
  simulateUtterance: (payload) => ipcRenderer.invoke('session:simulate-utterance', payload),
  toggleSpeaker: (segmentId) => ipcRenderer.invoke('session:toggle-speaker', segmentId),
  focusSegment: (segmentId) => ipcRenderer.invoke('session:focus-segment', segmentId),
  answerSegment: (segmentId) => ipcRenderer.invoke('session:answer-segment', segmentId),
  copilotLookup: (payload) => ipcRenderer.invoke('copilot:lookup', payload),
  copilotFindMore: (cardId, followUpQuestion) =>
    ipcRenderer.invoke('copilot:find-more', { cardId, followUpQuestion }),
  removeCard: (cardId) => ipcRenderer.invoke('copilot:remove-card', cardId),
  openInBrowser: (payload) => ipcRenderer.invoke('copilot:open-browser', payload),
  // Only real files dropped by the user resolve to a path, so the page can't ask for arbitrary files.
  addDroppedFiles: (files) =>
    ipcRenderer.invoke(
      'session:add-context-files',
      Array.from(files || [])
        .map((file) => webUtils.getPathForFile(file))
        .filter(Boolean)
    ),
  pickContextDoc: () => ipcRenderer.invoke('session:pick-context-doc'),
  listAudioApps: () => ipcRenderer.invoke('audio:list-apps'),
  setChannelMuted: (speaker, muted) => ipcRenderer.invoke('audio:set-channel-muted', { speaker, muted }),
  setSysAudioApp: (app) => ipcRenderer.invoke('audio:set-sys-app', app),
  removeContextDoc: (docId) => ipcRenderer.invoke('session:remove-context-doc', docId),

  onSessionUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('session:updated', handler);
    return () => ipcRenderer.removeListener('session:updated', handler);
  },
  onCopilotCardUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('copilot:card-updated', handler);
    return () => ipcRenderer.removeListener('copilot:card-updated', handler);
  },
  onSuggestionsUpdated: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('copilot:suggestions-updated', handler);
    return () => ipcRenderer.removeListener('copilot:suggestions-updated', handler);
  },
  onAudioLevel: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('audio:level', handler);
    return () => ipcRenderer.removeListener('audio:level', handler);
  },
  onAudioStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('audio:status', handler);
    return () => ipcRenderer.removeListener('audio:status', handler);
  },
  onRecordingState: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('recording:state', handler);
    return () => ipcRenderer.removeListener('recording:state', handler);
  }
});
