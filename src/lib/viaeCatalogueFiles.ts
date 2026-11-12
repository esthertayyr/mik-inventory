import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

type CatalogueFolder = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
};
type CatalogueDownload = { label: string; file: string };
type CatalogueEntry = { serial: string; zip?: string; generator?: string; downloads?: CatalogueDownload[] };
const bucket = 'viae-catalogue-files';
const privateCopiesKey = 'mik-viae-private-copies';

function savedCopies(): Record<string, string> {
  return JSON.parse(localStorage.getItem(privateCopiesKey) ?? '{}');
}

async function uploadPrivateFile(asset: NonNullable<ReturnType<typeof assetPath>>, file: File) {
  if (file.size > 50_000_000) throw new Error('This file exceeds the 50 MB private upload limit. Download it from the connected PC.');
  const contentType = asset.extension === 'html' ? 'text/html' : asset.extension === 'zip' ? 'application/zip' : 'application/octet-stream';
  const { error } = await supabase.storage.from(bucket).upload(asset.key, file.slice(0, file.size, contentType), {
    upsert: true,
    contentType,
    cacheControl: '0',
  });
  if (error) throw new Error(error.message);
}

function fingerprint(file: File) {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}

async function folderSetting(value?: CatalogueFolder) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('mik-viae-catalogue', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<CatalogueFolder | undefined>((resolve, reject) => {
      const transaction = database.transaction('settings', value ? 'readwrite' : 'readonly');
      const settings = transaction.objectStore('settings');
      const request = value ? settings.put(value, 'folder') : settings.get('folder');
      transaction.oncomplete = () => resolve(value ?? request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function downloadFiles(source: CatalogueEntry): CatalogueDownload[] {
  if (source.downloads?.length) return source.downloads;
  const file = source.zip || source.generator || '';
  return file ? [{ label: 'Print files', file }] : [];
}

function assetPath(code: string, relative: string, index = 0, multi = false) {
  const extension = relative.split('.').pop()?.toLowerCase();
  if (!extension || !['zip', 'html', '3mf', 'stl'].includes(extension)) return null;
  const parts = relative.split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) return null;
  const filename = parts.pop()!;
  const key = multi ? `${code}/parts/${index + 1}-${filename}` : `${code}/download.${extension}`;
  return { directories: parts, filename, key, extension };
}

async function localFile(folder: CatalogueFolder, asset: NonNullable<ReturnType<typeof assetPath>>) {
  let directory: FileSystemDirectoryHandle = folder;
  for (const part of asset.directories) directory = await directory.getDirectoryHandle(part);
  return (await directory.getFileHandle(asset.filename)).getFile();
}

export function useViaeCatalogueFiles(canEdit: boolean, onSync: () => Promise<void>, showMessage: (message: string) => void) {
  const picker = Platform.OS === 'web'
    ? (window as Window & { showDirectoryPicker?: () => Promise<CatalogueFolder> }).showDirectoryPicker
    : undefined;
  const [folder, setFolder] = useState<CatalogueFolder>();
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const manifest = useRef('');
  const running = useRef(false);

  useEffect(() => {
    if (!canEdit || !picker) return;
    let active = true;
    void folderSetting().then(async saved => {
      if (!saved) return;
      const allowed = await saved.queryPermission({ mode: 'read' }) === 'granted';
      if (!active) return;
      setFolder(saved);
      setConnected(allowed);
    }).catch(() => {});
    return () => { active = false; };
  }, [canEdit, picker]);

  async function connect() {
    if (!picker) return;
    setUploadProgress('Opening folder selection…');
    try {
      // Open the picker immediately during the click gesture. A stale saved
      // handle can be denied silently, and awaiting permission first can also
      // consume the browser gesture needed to open the native folder picker.
      const next = await picker.call(window);
      if (await next.requestPermission({ mode: 'read' }) !== 'granted') {
        setUploadProgress('Folder access was not granted. Choose the VIAE folder and allow access to continue.');
        return;
      }
      await next.getFileHandle('Catalogue_Data.json');
      manifest.current = '';
      if (!folder || !await next.isSameEntry(folder)) localStorage.removeItem(privateCopiesKey);
      setFolder(next);
      setConnected(true);
      await folderSetting(next);
      setUploadProgress('VIAE source folder connected.');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setUploadProgress('Folder selection canceled. Choose the VIAE folder to continue.');
      } else {
        const detail = (error as Error).name === 'NotFoundError'
          ? 'That folder does not contain Catalogue_Data.json.'
          : (error as Error).message;
        setUploadProgress(`Could not connect the source folder. ${detail}`);
        showMessage(`Could not connect the source folder. ${detail}`);
      }
    }
  }

  const sync = useCallback(async () => {
    if (!canEdit || !connected || !folder || running.current) return;
    running.current = true;
    try {
      if (await folder.queryPermission({ mode: 'read' }) !== 'granted') {
        setConnected(false);
        return;
      }
      const file = await (await folder.getFileHandle('Catalogue_Data.json')).getFile();
      const contents = await file.text();
      const { sets } = JSON.parse(contents);
      if (!Array.isArray(sets) || sets.length === 0) throw new Error('Catalogue_Data.json has no entries.');
      // The desktop and MIK use different codes for these two legacy sets.
      const aliases: Record<string, string> = { C099: 'G002', C101: 'G003' };
      const items = sets.map((entry: CatalogueEntry) => ({ ...entry, serial: aliases[entry.serial] ?? entry.serial }));
      if (manifest.current !== contents) {
        setSyncing(true);
        // The private download-library manifest intentionally contains only
        // serials, names, and download paths. Do not import it as the full
        // catalogue: missing category data would turn hosted generators into
        // "Other" and can violate the published-item database guard.
        const hasFullCatalogueData = items.every((entry: CatalogueEntry & { main?: string; preview?: string }) =>
          typeof entry.main === 'string' && entry.main.trim().length > 0 &&
          typeof entry.preview === 'string' && entry.preview.trim().length > 0,
        );
        if (hasFullCatalogueData) {
          const { data, error } = await supabase.rpc('import_viae_design_catalogue', {
            p_items: items,
            p_reconcile_missing: false,
          });
          if (error) throw new Error(error.message);
          await onSync();
          showMessage(`${data} catalogue entries synced from the VIAE folder.`);
        } else {
          showMessage('Private file-library manifest detected. Catalogue records were left unchanged; linked files are ready to upload to MIK.');
        }
        manifest.current = contents;
      }
      const copies = savedCopies();
      const failures: string[] = [];
      for (const item of items) {
        const downloads = downloadFiles(item);
        const multi = Boolean(item.downloads?.length);
        for (let index = 0; index < downloads.length; index += 1) {
          const download = downloads[index];
          const copyKey = multi ? `${item.serial}::${index}` : item.serial;
          if (!copies[copyKey]) continue;
          const asset = assetPath(item.serial, download.file, index, multi);
          if (!asset) continue;
          try {
            const local = await localFile(folder, asset);
            const version = fingerprint(local);
            if (version === copies[copyKey]) continue;
            await uploadPrivateFile(asset, local);
            localStorage.setItem(privateCopiesKey, JSON.stringify({ ...savedCopies(), [copyKey]: version }));
          } catch {
            failures.push(`${item.serial} ${download.label}`);
          }
        }
      }
      if (failures.length) showMessage(`Private copies could not be refreshed: ${failures.join(', ')}.`);
    } catch (error) {
      showMessage(`Catalogue sync failed. ${(error as Error).message}`);
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [canEdit, connected, folder, onSync, showMessage]);

  const uploadAll = useCallback(async () => {
    if (!canEdit || !connected || !folder || running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      if (await folder.queryPermission({ mode: 'read' }) !== 'granted') {
        setConnected(false);
        throw new Error('Reconnect the VIAE folder to continue.');
      }
      const file = await (await folder.getFileHandle('Catalogue_Data.json')).getFile();
      const { sets } = JSON.parse(await file.text());
      if (!Array.isArray(sets) || !sets.length) throw new Error('Catalogue_Data.json has no entries.');
      const aliases: Record<string, string> = { C099: 'G002', C101: 'G003' };
      const items = sets.map((entry: CatalogueEntry) => ({ ...entry, serial: aliases[entry.serial] ?? entry.serial }));
      const queue = items.flatMap((item: CatalogueEntry) => {
        const downloads = downloadFiles(item);
        const multi = Boolean(item.downloads?.length);
        return downloads.map((download, index) => {
          const asset = assetPath(item.serial, download.file, index, multi);
          return asset ? { item, download, index, multi, asset, copyKey: multi ? `${item.serial}::${index}` : item.serial } : null;
        }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      });
      if (!queue.length) throw new Error('No linked STL, 3MF, ZIP or generator files were found.');
      const copies = savedCopies();
      let uploaded = 0;
      let current = 0;
      const failures: string[] = [];
      for (let index = 0; index < queue.length; index += 1) {
        const entry = queue[index];
        setUploadProgress(`Saving files to MIK · ${index + 1} of ${queue.length} · ${entry.item.serial}`);
        try {
          const local = await localFile(folder, entry.asset);
          const version = fingerprint(local);
          if (copies[entry.copyKey] === version) { current += 1; continue; }
          await uploadPrivateFile(entry.asset, local);
          const next = { ...savedCopies(), [entry.copyKey]: version };
          localStorage.setItem(privateCopiesKey, JSON.stringify(next));
          copies[entry.copyKey] = version;
          uploaded += 1;
        } catch (error) {
          failures.push(`${entry.item.serial} ${entry.download.label}: ${(error as Error).message}`);
        }
      }
      await onSync();
      const detail = failures.length ? ` ${failures.length} need attention: ${failures.slice(0, 4).join('; ')}${failures.length > 4 ? '; …' : ''}` : '';
      showMessage(`MIK file library updated: ${uploaded} uploaded, ${current} already current, ${failures.length} missing or failed.${detail}`);
    } catch (error) {
      showMessage(`Could not save catalogue files to MIK. ${(error as Error).message}`);
    } finally {
      running.current = false;
      setSyncing(false);
      setUploadProgress('');
    }
  }, [canEdit, connected, folder, onSync, showMessage]);

  useEffect(() => {
    if (!connected) return;
    void sync();
    const timer = setInterval(() => { void sync(); }, 60_000);
    window.addEventListener('focus', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
    };
  }, [connected, sync]);

  async function download(code: string, source: CatalogueEntry, file: string, index: number) {
    const asset = assetPath(code, file, index, Boolean(source.downloads?.length));
    if (!asset) throw new Error('No downloadable file is linked to this item.');
    if (canEdit && connected && folder) {
      try {
        const file = await localFile(folder, asset);
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = asset.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      } catch (error) {
        if ((error as Error).name !== 'NotFoundError') throw error;
      }
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(asset.key, 60, { download: asset.filename });
    if (error || !data) throw new Error('No private copy is available. On the source PC, connect the VIAE folder and save a private copy.');
    return data.signedUrl;
  }

  async function savePrivateCopy(code: string, source: CatalogueEntry, relativeFile: string, index: number) {
    const multi = Boolean(source.downloads?.length);
    const asset = assetPath(code, relativeFile, index, multi);
    if (!canEdit || !connected || !folder || !asset) throw new Error('Connect the VIAE folder and select an item with a linked file.');
    const local = await localFile(folder, asset);
    await uploadPrivateFile(asset, local);
    const copyKey = multi ? `${code}::${index}` : code;
    localStorage.setItem(privateCopiesKey, JSON.stringify({ ...savedCopies(), [copyKey]: fingerprint(local) }));
  }

  async function saveUploadedCopy(code: string, source: CatalogueEntry, relativeFile: string, index: number, file: File) {
    const multi = Boolean(source.downloads?.length);
    const asset = assetPath(code, relativeFile, index, multi);
    if (!canEdit || !asset) throw new Error('Choose an item with a linked private file.');
    if (file.name.toLowerCase() !== asset.filename.toLowerCase()) {
      throw new Error(`Choose the matching file: ${asset.filename}`);
    }
    await uploadPrivateFile(asset, file);
    const copyKey = multi ? `${code}::${index}` : code;
    localStorage.setItem(privateCopiesKey, JSON.stringify({ ...savedCopies(), [copyKey]: fingerprint(file) }));
  }

  return { supported: Boolean(picker), connected, reconnect: Boolean(folder), syncing, uploadProgress, connect, sync, uploadAll, download, savePrivateCopy, saveUploadedCopy };
}
