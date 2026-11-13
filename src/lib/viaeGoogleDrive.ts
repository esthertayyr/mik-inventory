import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

type DriveFile = { relative_path: string; drive_file_id: string; file_name: string; mime_type: string; size_bytes: number; updated_at: string };
type FolderHandle = FileSystemDirectoryHandle & { queryPermission(options: { mode: 'read' }): Promise<PermissionState>; requestPermission(options: { mode: 'read' }): Promise<PermissionState> };
type Download = { label: string; file: string };
type Entry = { serial: string; zip?: string; generator?: string; downloads?: Download[] };
type Asset = { sourceDirectories: string[]; driveDirectories: string[]; filename: string; driveName: string; key: string };
const BUSINESS = '3fe4c82d-a659-406b-b290-32d8a49f2bdf';
function listDownloads(entry: Entry) { return entry.downloads?.length ? entry.downloads : (entry.zip || entry.generator) ? [{ label: 'Print files', file: entry.zip || entry.generator! }] : []; }
function asset(code: string, relative: string, index: number, multi: boolean): Asset | null {
  const extension = relative.split('.').pop()?.toLowerCase();
  if (!extension || !['html', '3mf', 'stl'].includes(extension)) return null;
  const parts = relative.split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) return null;
  const filename = parts.pop()!;
  const driveName = multi ? `${index + 1}-${filename}` : `download.${extension}`;
  return { sourceDirectories: parts, driveDirectories: [code, ...(multi ? ['parts'] : [])], filename, driveName, key: multi ? `${code}/parts/${index + 1}-${filename}` : `${code}/download.${extension}` };
}
function mime(name: string) { const ext = name.split('.').pop()?.toLowerCase(); return ext === 'html' ? 'text/html' : 'application/octet-stream'; }

export function useViaeGoogleDrive(canEdit: boolean, showMessage: (message: string) => void) {
  const [connected, setConnected] = useState(false), [email, setEmail] = useState(''), [rootId, setRootId] = useState('');
  const [files, setFiles] = useState<DriveFile[]>([]), [busy, setBusy] = useState(false), [progress, setProgress] = useState('');
  const [folder, setFolder] = useState<FolderHandle>();
  const picker = Platform.OS === 'web' ? (window as Window & { showDirectoryPicker?: () => Promise<FolderHandle> }).showDirectoryPicker : undefined;
  const fileMap = new Map(files.map(file => [file.relative_path, file]));

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('viae-drive-connector', { body: { action, ...extra } });
    if (error) {
      let message = data?.error || error.message;
      const context = (error as typeof error & { context?: Response }).context;
      if (context) {
        const response = await context.clone().json().catch(() => null) as { error?: string; message?: string } | null;
        message = response?.error || response?.message || message;
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);
  const refresh = useCallback(async () => {
    try {
      const data = await call('status');
      setConnected(Boolean(data.connected)); setEmail(data.email || ''); setRootId(data.folderId || ''); setFiles(data.files || []);
    } catch (error) { showMessage((error as Error).message); }
  }, [call, showMessage]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    const state = params.get('viae_drive');
    if (!state) return;
    if (state === 'connected') showMessage('Google Drive is connected to VIAE in MIK.');
    if (state === 'error') showMessage(params.get('viae_drive_message') || 'Google Drive could not connect.');
    params.delete('viae_drive'); params.delete('viae_drive_message');
    const search = params.toString(); window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
    void refresh();
  }, [refresh, showMessage]);

  const connect = useCallback(async () => {
    if (!canEdit || Platform.OS !== 'web') return;
    setBusy(true);
    try {
      const returnTo = `${window.location.origin}/`;
      const data = await call('start', { returnTo });
      window.location.assign(data.authUrl);
    } catch (error) { showMessage((error as Error).message); setBusy(false); }
  }, [call, canEdit, showMessage]);

  const chooseFolder = useCallback(async () => {
    if (!picker) { showMessage('Open MIK in Chrome or Edge on the computer that has the VIAE folder.'); return; }
    try {
      const picked = await picker.call(window);
      if (await picked.requestPermission({ mode: 'read' }) !== 'granted') return;
      await picked.getFileHandle('Catalogue_Data.json'); setFolder(picked);
      showMessage('VIAE folder selected. Choose “Upload linked catalogue files” to send the catalogue files to Drive.');
    } catch (error) { if ((error as Error).name !== 'AbortError') showMessage('Select the VIAE folder containing Catalogue_Data.json.'); }
  }, [picker, showMessage]);

  const uploadAll = useCallback(async () => {
    if (!canEdit || !folder || !connected || busy) return;
    setBusy(true);
    try {
      const manifestFile = await (await folder.getFileHandle('Catalogue_Data.json')).getFile();
      const parsed = JSON.parse(await manifestFile.text());
      if (!Array.isArray(parsed.sets)) throw new Error('The selected folder has no valid catalogue.');
      const aliases: Record<string, string> = { C099: 'G002', C101: 'G003' };
      const entries: Entry[] = parsed.sets.map((entry: Entry) => ({ ...entry, serial: aliases[entry.serial] || entry.serial }));
      const queue = entries.flatMap(entry => listDownloads(entry).map((download, index) => {
        const fileAsset = asset(entry.serial, download.file, index, Boolean(entry.downloads?.length));
        return fileAsset ? { entry, download, index, multi: Boolean(entry.downloads?.length), fileAsset } : null;
      }).filter((item): item is NonNullable<typeof item> => Boolean(item)));
      if (!queue.length) throw new Error('No linked STL, 3MF or generator HTML files were found.');
      const { accessToken, folderId } = await call('access');
      const dirCache = new Map<string, string>([['', folderId]]);
      const google = async (url: string, init: RequestInit = {}) => {
        const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || `Google Drive returned ${response.status}.`);
        return data;
      };
      const getDirectory = async (parts: string[]) => {
        let parent = folderId, path = '';
        for (const part of parts) {
          path = path ? `${path}/${part}` : part;
          if (dirCache.has(path)) { parent = dirCache.get(path)!; continue; }
          const q = `name='${part.replaceAll("'", "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`;
          const found = await google(`https://www.googleapis.com/drive/v3/files?fields=files(id)&pageSize=100&q=${encodeURIComponent(q)}`);
          const id = found.files?.[0]?.id || (await google('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })).id;
          if (!id) throw new Error(`Could not create Drive folder ${part}.`);
          dirCache.set(path, id); parent = id;
        }
        return parent;
      };
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i], label = `${item.entry.serial} · ${item.download.label}`;
        setProgress(`Uploading ${i + 1} of ${queue.length} · ${label}`);
        let directory: FileSystemDirectoryHandle = folder;
        for (const part of item.fileAsset.sourceDirectories) directory = await directory.getDirectoryHandle(part);
        const local = await (await directory.getFileHandle(item.fileAsset.filename)).getFile();
        const parent = await getDirectory(item.fileAsset.driveDirectories);
        const q = `name='${item.fileAsset.driveName.replaceAll("'", "\\'")}' and '${parent}' in parents and trashed=false`;
        const found = await google(`https://www.googleapis.com/drive/v3/files?fields=files(id)&pageSize=100&q=${encodeURIComponent(q)}`);
        const existingId = found.files?.[0]?.id;
        const metadata = { name: item.fileAsset.driveName, mimeType: mime(item.fileAsset.driveName), ...(existingId ? {} : { parents: [parent] }) };
        const startUrl = `https://www.googleapis.com/upload/drive/v3/files${existingId ? `/${existingId}` : ''}?uploadType=resumable&fields=id,name,mimeType,size`;
        const initiated = await fetch(startUrl, { method: existingId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': metadata.mimeType }, body: JSON.stringify(metadata) });
        if (!initiated.ok) throw new Error(`Google Drive could not start upload for ${local.name}.`);
        const uploadUrl = initiated.headers.get('Location');
        if (!uploadUrl) throw new Error('Google Drive did not return its upload address.');
        const chunkSize = 8 * 1024 * 1024;
        let uploadedFile: { id: string; name: string; mimeType?: string; size?: string } | undefined;
        for (let start = 0; start < local.size; start += chunkSize) {
          const end = Math.min(start + chunkSize, local.size), chunk = await local.slice(start, end).arrayBuffer();
          const response = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Range': `bytes ${start}-${end - 1}/${local.size}` }, body: chunk });
          if (response.status === 308) continue;
          if (!response.ok) { const problem = await response.json().catch(() => ({})); throw new Error(problem.error?.message || `Upload failed for ${local.name}.`); }
          uploadedFile = await response.json();
        }
        if (local.size === 0) { const response = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Range': 'bytes */0' } }); if (response.ok) uploadedFile = await response.json(); }
        if (!uploadedFile?.id) throw new Error(`Google Drive did not confirm ${local.name}. Please retry the sync.`);
        const { data: registered, error: registerError } = await supabase.functions.invoke('viae-drive-connector', { body: { action: 'register', path: item.fileAsset.key, fileId: uploadedFile.id, fileName: uploadedFile.name || item.fileAsset.filename, mimeType: uploadedFile.mimeType || metadata.mimeType, sizeBytes: local.size } });
        if (registerError || registered?.error) throw new Error(registered?.error || registerError?.message || 'MIK could not save the file record.');
      }
      await refresh(); showMessage(`${queue.length} linked catalogue files are now in the private VIAE Drive library.`);
    } catch (error) { showMessage(`Drive upload stopped. ${(error as Error).message}`); }
    finally { setBusy(false); setProgress(''); }
  }, [busy, call, canEdit, connected, folder, refresh, showMessage]);

  const download = useCallback(async (path: string) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) throw new Error('Sign in to MIK first.');
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/viae-drive-download`, { method: 'POST', headers: { Authorization: `Bearer ${session.session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
    if (!response.ok) { const info = await response.json().catch(() => ({})); throw new Error(info.error || 'The Drive file could not be downloaded.'); }
    const blob = await response.blob(), name = decodeURIComponent(response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || path.split('/').pop() || 'VIAE-file');
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  return { connected, email, files, fileMap, busy, progress, hasFolder: Boolean(folder), pickerSupported: Boolean(picker), connect, chooseFolder, uploadAll, download, refresh };
}
