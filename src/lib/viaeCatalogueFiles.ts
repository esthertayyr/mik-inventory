import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

type CatalogueFolder = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
};
type CatalogueEntry = { serial: string; zip?: string; generator?: string };
const bucket = 'viae-catalogue-files';
const privateCopiesKey = 'mik-viae-private-copies';

function savedCopies(): Record<string, string> {
  return JSON.parse(localStorage.getItem(privateCopiesKey) ?? '{}');
}

async function uploadPrivateFile(asset: NonNullable<ReturnType<typeof assetPath>>, file: File) {
  if (file.size > 50_000_000) throw new Error('This file exceeds the 50 MB private upload limit. Download it from the connected PC.');
  const contentType = asset.extension === 'html' ? 'text/html' : asset.extension === 'zip' ? 'application/zip' : 'application/octet-stream';
  const { error } = await supabase.storage.from(bucket).upload(asset.key, file, {
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

function assetPath(code: string, source: CatalogueEntry) {
  const relative = source.zip || source.generator || '';
  const extension = relative.split('.').pop()?.toLowerCase();
  if (!extension || !['zip', 'html', '3mf', 'stl'].includes(extension)) return null;
  const parts = relative.split(/[\\/]/);
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) return null;
  const filename = parts.pop()!;
  return { directories: parts, filename, key: `${code}/download.${extension}`, extension };
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
    try {
      const next = folder && !connected ? folder : await picker.call(window);
      if (await next.requestPermission({ mode: 'read' }) !== 'granted') return;
      await next.getFileHandle('Catalogue_Data.json');
      manifest.current = '';
      if (!folder || !await next.isSameEntry(folder)) localStorage.removeItem(privateCopiesKey);
      setFolder(next);
      setConnected(true);
      await folderSetting(next);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showMessage('Choose your VIAE folder containing Catalogue_Data.json.');
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
        const { data, error } = await supabase.rpc('import_viae_design_catalogue', {
          p_items: items,
          p_reconcile_missing: false,
        });
        if (error) throw new Error(error.message);
        manifest.current = contents;
        await onSync();
        showMessage(`${data} catalogue entries synced from the VIAE folder.`);
      }
      const copies = savedCopies();
      const failures: string[] = [];
      for (const item of items) {
        if (!copies[item.serial]) continue;
        const asset = assetPath(item.serial, item);
        if (!asset) continue;
        try {
          const local = await localFile(folder, asset);
          const version = fingerprint(local);
          if (version === copies[item.serial]) continue;
          await uploadPrivateFile(asset, local);
          localStorage.setItem(privateCopiesKey, JSON.stringify({ ...savedCopies(), [item.serial]: version }));
        } catch {
          failures.push(item.serial);
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

  async function download(code: string, source: CatalogueEntry) {
    const asset = assetPath(code, source);
    if (!asset) throw new Error('No downloadable file is linked to this item.');
    if (canEdit && connected && folder) {
      try {
        const file = await localFile(folder, asset);
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = asset.filename;
        link.click();
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

  async function savePrivateCopy(code: string, source: CatalogueEntry) {
    const asset = assetPath(code, source);
    if (!canEdit || !connected || !folder || !asset) throw new Error('Connect the VIAE folder and select an item with a linked file.');
    const file = await localFile(folder, asset);
    await uploadPrivateFile(asset, file);
    localStorage.setItem(privateCopiesKey, JSON.stringify({ ...savedCopies(), [code]: fingerprint(file) }));
  }

  return { supported: Boolean(picker), connected, reconnect: Boolean(folder), syncing, connect, sync, download, savePrivateCopy };
}
