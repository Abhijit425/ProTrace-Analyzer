/** IPC channel names, shared by main and preload so they never drift apart. */
export const IPC = {
  pickFiles: 'dialog:pick-files',
  pickFolder: 'dialog:pick-folder',
  ingest: 'ingest:start',
  cancelIngest: 'ingest:cancel',
  ingestProgress: 'ingest:progress',
  ingestFileDone: 'ingest:file-done',
  ingestComplete: 'ingest:complete',
  newSession: 'session:new',
  listFiles: 'files:list',
  removeFile: 'files:remove',
  applyView: 'view:apply',
  getRows: 'view:rows',
  getFacets: 'view:facets',
  getRecent: 'recent:get',
  clearRecent: 'recent:clear',
} as const
