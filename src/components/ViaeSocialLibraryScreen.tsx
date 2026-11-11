import { createElement, useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Text, TextInput } from './AppTypography';
import { supabase } from '@/src/lib/supabase';

type Folder = { id: string; name: string };
type Asset = { id: string; title: string; storage_path: string; folder_id: string | null; prompt_text: string | null; media_type: 'image' | 'video'; image_url: string };
type Prompt = { id: string; title: string; prompt_text: string; folder_id: string | null };
const bucket = 'social-posters';
export function ViaeSocialLibraryScreen({ businessId, onBack, canManage }: { businessId: string; onBack: () => void; canManage: boolean }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [assetTitle, setAssetTitle] = useState('');
  const [assetNote, setAssetNote] = useState('');
  const [assetFolderId, setAssetFolderId] = useState<string | null>(null);
  const [promptTitle, setPromptTitle] = useState('');
  const [promptText, setPromptText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [f, a, p] = await Promise.all([
      supabase.from('viae_social_folders').select('id,name').eq('business_id', businessId).order('name'),
      supabase.from('shop_social_images').select('id,title,storage_path,folder_id,prompt_text,media_type').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('viae_social_prompts').select('id,title,prompt_text,folder_id').eq('business_id', businessId).order('created_at', { ascending: false }),
    ]);
    const error = f.error ?? a.error ?? p.error;
    if (error) setMessage(error.message);
    else {
      setFolders(f.data ?? []);
      setPrompts(p.data ?? []);
      const signedAssets = await Promise.all((a.data ?? []).map(async row => {
        const signed = await supabase.storage.from(bucket).createSignedUrl(row.storage_path, 3600);
        return { ...row, image_url: signed.data?.signedUrl ?? '' };
      }));
      setAssets(signedAssets);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addFolder = async () => {
    const name = folderName.trim();
    if (!canManage || !name || busy) return;
    setBusy(true); setMessage('');
    const result = await supabase.from('viae_social_folders').insert({ business_id: businessId, name }).select('id,name').single();
    if (result.error) setMessage(result.error.message);
    else { setFolderName(''); setFolderId(result.data.id); await load(); }
    setBusy(false);
  };

  const uploadMedia = async () => {
    if (!canManage || busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photo access needed', 'Allow MIK to choose a promotion image from this device.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1, videoMaxDuration: 90 });
    if (picked.canceled) return;
    setBusy(true); setMessage('');
    let path = '';
    try {
      const asset = picked.assets[0];
      const mediaType = asset.type === 'video' ? 'video' : 'image';
      let uploadUri = asset.uri;
      let contentType = asset.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
      let extension = asset.fileName?.split('.').pop()?.toLowerCase();
      if (mediaType === 'image') {
        const image = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1800 } }], { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG });
        uploadUri = image.uri;
        contentType = 'image/jpeg';
        extension = 'jpg';
      } else if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(contentType)) {
        const extType = extension === 'mov' ? 'video/quicktime' : extension === 'webm' ? 'video/webm' : extension === 'mp4' ? 'video/mp4' : '';
        if (!extType) throw new Error('Choose an MP4, MOV, or WebM video.');
        contentType = extType;
      }
      if (!extension || !/^[a-z0-9]{2,5}$/.test(extension)) extension = mediaType === 'video' ? 'mp4' : 'jpg';
      const bytes = await (await fetch(uploadUri)).arrayBuffer();
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('This file is larger than 20 MB. Please choose a shorter or smaller video.');
      path = `${businessId}/social/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const upload = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
      if (upload.error) throw upload.error;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const signed = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (signed.error) throw signed.error;
      const save = await supabase.from('shop_social_images').insert({
        business_id: businessId,
        title: assetTitle.trim() || asset.fileName?.replace(/\.[^.]+$/, '') || (mediaType === 'video' ? 'Promotion video' : 'Promotion image'),
        image_url: signed.data.signedUrl,
        storage_path: path,
        folder_id: assetFolderId,
        media_type: mediaType,
        prompt_text: assetNote.trim() || null,
        created_by: user.id,
      });
      if (save.error) throw save.error;
      setAssetTitle(''); setAssetNote('');
      setMessage(`Promotion ${mediaType} saved to the VIAE library.`);
      await load();
    } catch (e) {
      if (path) await supabase.storage.from(bucket).remove([path]);
      setMessage(e instanceof Error ? e.message : 'The image could not be saved.');
    } finally { setBusy(false); }
  };

  const savePrompt = async () => {
    if (!canManage || busy || !promptTitle.trim() || !promptText.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Please sign in again.'); return; }
    setBusy(true); setMessage('');
    const result = await supabase.from('viae_social_prompts').insert({ business_id: businessId, folder_id: folderId, title: promptTitle.trim(), prompt_text: promptText.trim(), created_by: user.id });
    if (result.error) setMessage(result.error.message);
    else { setPromptTitle(''); setPromptText(''); setMessage('Prompt saved.'); await load(); }
    setBusy(false);
  };

  const confirm = (title: string, body: string, action: () => void) => {
    if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${body}`)) action(); }
    else Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: action }]);
  };
  const removeAsset = (item: Asset) => confirm('Remove this image?', item.title, () => { void (async () => {
    const deleted = await supabase.from('shop_social_images').delete().eq('id', item.id).eq('business_id', businessId);
    if (deleted.error) { setMessage(deleted.error.message); return; }
    await supabase.storage.from(bucket).remove([item.storage_path]);
    setAssets(current => current.filter(row => row.id !== item.id));
  })(); });
  const removePrompt = (item: Prompt) => confirm('Remove this prompt?', item.title, () => { void (async () => {
    const result = await supabase.from('viae_social_prompts').delete().eq('id', item.id).eq('business_id', businessId);
    if (result.error) setMessage(result.error.message); else setPrompts(current => current.filter(row => row.id !== item.id));
  })(); });
  const moveAsset = async (item: Asset, targetFolderId: string | null) => {
    const result = await supabase.from('shop_social_images').update({ folder_id: targetFolderId }).eq('id', item.id).eq('business_id', businessId);
    if (result.error) setMessage(result.error.message);
    else setAssets(current => current.map(row => row.id === item.id ? { ...row, folder_id: targetFolderId } : row));
  };
  const download = async (item: Asset) => {
    const extension = item.storage_path.split('.').pop() || (item.media_type === 'video' ? 'mp4' : 'jpg');
    const result = await supabase.storage.from(bucket).createSignedUrl(item.storage_path, 300, { download: `${item.title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'viae-promotion'}.${extension}` });
    if (result.error || !result.data) { setMessage(result.error?.message ?? 'Could not prepare the download.'); return; }
    if (Platform.OS === 'web') { const a = document.createElement('a'); a.href = result.data.signedUrl; a.download = ''; a.click(); }
    else await Linking.openURL(result.data.signedUrl);
  };
  const shownAssets = assets.filter(row => !folderId || row.folder_id === folderId);
  const shownPrompts = prompts.filter(row => !folderId || row.folder_id === folderId);

  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.top}><Pressable onPress={onBack}><Text style={s.link}>‹ Back</Text></Pressable><Text style={s.title}>VIAE Social Media Library</Text></View>
    <Text style={s.body}>Promotion images and reusable post prompts for Facebook and Instagram. This library is private to MIK and separate from product photos.</Text>
    <View style={s.panel}>
      <Text style={s.section}>Folders</Text>
      <View style={s.chips}><Pressable style={[s.chip, !folderId && s.active]} onPress={() => setFolderId(null)}><Text style={!folderId ? s.activeText : s.chipText}>All media</Text></Pressable>{folders.map(folder => <Pressable key={folder.id} style={[s.chip, folderId === folder.id && s.active]} onPress={() => setFolderId(folder.id)}><Text style={folderId === folder.id ? s.activeText : s.chipText}>{folder.name}</Text></Pressable>)}</View>
      {canManage && <View style={s.inline}><TextInput value={folderName} onChangeText={setFolderName} placeholder="New folder name" style={[s.input, s.grow]}/><Pressable disabled={busy || !folderName.trim()} onPress={() => void addFolder()} style={s.button}><Text style={s.buttonText}>Create folder</Text></Pressable></View>}
    </View>
    {canManage && <View style={s.panel}><Text style={s.section}>Add promotion image or video</Text><TextInput value={assetTitle} onChangeText={setAssetTitle} placeholder="Title" style={s.input}/><TextInput value={assetNote} onChangeText={setAssetNote} placeholder="Optional caption or prompt used for this media" multiline style={[s.input, s.multiline]}/><Text style={s.hint}>Save to folder</Text><View style={s.chips}><Pressable style={[s.chip, !assetFolderId && s.active]} onPress={() => setAssetFolderId(null)}><Text style={!assetFolderId ? s.activeText : s.chipText}>Unsorted</Text></Pressable>{folders.map(folder => <Pressable key={folder.id} style={[s.chip, assetFolderId === folder.id && s.active]} onPress={() => setAssetFolderId(folder.id)}><Text style={assetFolderId === folder.id ? s.activeText : s.chipText}>{folder.name}</Text></Pressable>)}</View><Pressable disabled={busy} onPress={() => void uploadMedia()} style={[s.button, s.self]}><Text style={s.buttonText}>{busy ? 'Saving…' : 'Choose and upload media'}</Text></Pressable><Text style={s.hint}>Images are compressed. Videos can be up to 20 MB and 90 seconds. Stored privately in MIK.</Text></View>}
    {canManage && <View style={s.panel}><Text style={s.section}>Saved prompts</Text><TextInput value={promptTitle} onChangeText={setPromptTitle} placeholder="Prompt title" style={s.input}/><TextInput value={promptText} onChangeText={setPromptText} placeholder="Reusable caption or image-generation prompt" multiline style={[s.input, s.multiline]}/><Pressable disabled={busy || !promptTitle.trim() || !promptText.trim()} onPress={() => void savePrompt()} style={[s.button, s.self]}><Text style={s.buttonText}>Save prompt</Text></Pressable></View>}
    {!!message && <Text accessibilityRole="alert" style={s.message}>{message}</Text>}
    <Text style={s.section}>{folderId ? folders.find(row => row.id === folderId)?.name : 'Promotion media'}</Text>
    {loading ? <Text style={s.body}>Loading library…</Text> : shownAssets.length === 0 ? <Text style={s.hint}>No promotion media in this folder yet.</Text> : <View style={s.grid}>{shownAssets.map(item => <View key={item.id} style={s.card}>{item.media_type === 'video' ? Platform.OS === 'web' ? createElement('video' as any, { src: item.image_url, controls: true, playsInline: true, style: { width: '100%', height: 250, backgroundColor: '#181818', borderRadius: 8, objectFit: 'contain' } }) : <Pressable onPress={() => void Linking.openURL(item.image_url)} style={[s.image, s.videoPreview]}><Text style={s.videoText}>▶  Play video</Text></Pressable> : <Image source={{ uri: item.image_url }} resizeMode="contain" style={s.image}/>}<Text style={s.cardTitle}>{item.title}</Text><Text style={s.hint}>{item.media_type === 'video' ? 'VIDEO' : 'IMAGE'}{item.prompt_text ? ` · ${item.prompt_text}` : ''}</Text>{canManage && <View style={s.inline}><Text style={s.hint}>Move to</Text><Pressable onPress={() => void moveAsset(item, null)} style={[s.chip, !item.folder_id && s.active]}><Text style={!item.folder_id ? s.activeText : s.chipText}>Unsorted</Text></Pressable>{folders.map(folder => <Pressable key={folder.id} onPress={() => void moveAsset(item, folder.id)} style={[s.chip, item.folder_id === folder.id && s.active]}><Text style={item.folder_id === folder.id ? s.activeText : s.chipText}>{folder.name}</Text></Pressable>)}</View>}<View style={s.inline}><Pressable onPress={() => void download(item)} style={s.button}><Text style={s.buttonText}>Download</Text></Pressable>{canManage && <Pressable onPress={() => removeAsset(item)} style={s.secondary}><Text style={s.chipText}>Remove</Text></Pressable>}</View></View>)}</View>}
    {shownPrompts.length > 0 && <View style={s.promptList}><Text style={s.section}>Reusable prompts</Text>{shownPrompts.map(item => <View key={item.id} style={s.promptCard}><View style={[s.inline, { justifyContent: 'space-between' }]}><Text style={s.cardTitle}>{item.title}</Text>{canManage && <Pressable onPress={() => removePrompt(item)}><Text style={s.link}>Delete</Text></Pressable>}</View><Text selectable style={s.body}>{item.prompt_text}</Text></View>)}</View>}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { padding: 22, paddingBottom: 70, gap: 16, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  title: { fontSize: 26, fontWeight: '700', color: '#202020' },
  section: { fontSize: 18, fontWeight: '700', color: '#202020' },
  body: { fontSize: 15, color: '#454545', lineHeight: 22 },
  hint: { fontSize: 13, color: '#666', lineHeight: 19 },
  panel: { padding: 18, gap: 12, borderWidth: 1, borderColor: '#dedede', borderRadius: 12, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: '#ccc', borderRadius: 18, backgroundColor: '#fff' },
  active: { backgroundColor: '#181818', borderColor: '#181818' },
  activeText: { color: '#fff', fontWeight: '700' },
  chipText: { color: '#222', fontWeight: '600' },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  grow: { flex: 1, minWidth: 190 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 11, backgroundColor: '#fff', fontSize: 15, color: '#202020' },
  multiline: { minHeight: 82, textAlignVertical: 'top' },
  button: { backgroundColor: '#181818', paddingVertical: 11, paddingHorizontal: 15, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { paddingVertical: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  self: { alignSelf: 'flex-start' },
  message: { color: '#7a1622', padding: 11, backgroundColor: '#fbf1f2', borderRadius: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: '31%', minWidth: 235, flexGrow: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, gap: 10, backgroundColor: '#fff' },
  image: { width: '100%', height: 250, backgroundColor: '#f5f5f5', borderRadius: 8 },
  videoPreview: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#181818' },
  videoText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  promptList: { marginTop: 12, gap: 10 },
  promptCard: { padding: 15, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, gap: 8, backgroundColor: '#fff' },
  link: { color: '#7a1622', fontSize: 15, fontWeight: '700' },
});
