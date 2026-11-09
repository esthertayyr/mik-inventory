import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from './AppTypography';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

export type ReceiptKind = 'sale' | 'trade_sale' | 'preorder' | 'order';
const tables = { sale: 'sales', trade_sale: 'reseller_trade_entries', preorder: 'reseller_preorders', order: 'external_orders' };

export async function attachSaleReceipt(kind: ReceiptKind, id: string, uri: string) {
  const parent = await supabase.from(tables[kind]).select('location_id').eq('id', id).single();
  if (parent.error) throw parent.error;
  const old = await supabase.from('sale_receipts').select('storage_path').eq('record_kind', kind).eq('record_id', id).maybeSingle();
  if (old.error) throw old.error;
  const photo = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: .85, format: ImageManipulator.SaveFormat.JPEG });
  const response = await fetch(photo.uri);
  const bytes = await response.arrayBuffer();
  const path = `${parent.data.location_id}/${kind}/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const upload = await supabase.storage.from('sale-receipts').upload(path, bytes, { contentType: 'image/jpeg' });
  if (upload.error) throw upload.error;
  const saved = await supabase.from('sale_receipts').upsert({ record_kind: kind, record_id: id, location_id: parent.data.location_id, storage_path: path }, { onConflict: 'record_kind,record_id' });
  if (saved.error) { await supabase.storage.from('sale-receipts').remove([path]); throw saved.error; }
  if (old.data?.storage_path) await supabase.storage.from('sale-receipts').remove([old.data.storage_path]);
}

export function ReceiptPicker({ uri, onChange, disabled = false }: { uri: string | null; onChange: (uri: string | null) => void; disabled?: boolean }) {
  const [error, setError] = useState('');
  async function pick() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled) { onChange(result.assets[0].uri); setError(''); }
    } catch { setError('Could not open photos. Please try again.'); }
  }
  return <View style={{ gap: 8, marginVertical: 10 }}><Text style={{ fontWeight: '600' }}>Receipt photo · Optional</Text>{uri ? <Image accessibilityLabel="Receipt preview" source={{ uri }} resizeMode="contain" style={{ width: '100%', height: 220 }} /> : null}<Pressable accessibilityRole="button" disabled={disabled} onPress={() => void pick()} style={{ padding: 12, backgroundColor: '#EDF3FB', borderRadius: 8 }}><Text>{uri ? 'Replace receipt photo' : 'Upload receipt photo'}</Text></Pressable>{uri ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onChange(null)} style={{ padding: 10 }}><Text>Remove receipt photo</Text></Pressable> : null}{error ? <Text>{error}</Text> : null}</View>;
}

export function SaleReceipt({ kind, recordId }: { kind: ReceiptKind; recordId: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [uri, setUri] = useState<string | null>(null), [path, setPath] = useState<string | null>(null), [error, setError] = useState('');
  async function load() {
    setBusy(true); setError('');
    try {
      const row = await supabase.from('sale_receipts').select('storage_path').eq('record_kind', kind).eq('record_id', recordId).maybeSingle();
      if (row.error) throw row.error;
      setPath(row.data?.storage_path ?? null);
      if (row.data) {
        const signed = await supabase.storage.from('sale-receipts').createSignedUrl(row.data.storage_path, 3600);
        if (signed.error) throw signed.error;
        setUri(signed.data.signedUrl);
      } else setUri(null);
      setOpen(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function change(next: string | null) {
    setBusy(true); setError('');
    try {
      if (next) await attachSaleReceipt(kind, recordId, next);
      else {
        const removed = await supabase.from('sale_receipts').delete().eq('record_kind', kind).eq('record_id', recordId);
        if (removed.error) throw removed.error;
        if (path) await supabase.storage.from('sale-receipts').remove([path]);
      }
      await load();
    } catch (e) { setError(`Receipt not saved: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  return <View><Pressable accessibilityRole="button" disabled={busy} onPress={() => open ? setOpen(false) : void load()} style={{ paddingVertical: 10 }}><Text style={{ color: '#315FBE' }}>{busy ? 'Saving / loading receipt…' : open ? 'Hide receipt' : 'Receipt photo'}</Text></Pressable>{open ? <ReceiptPicker uri={uri} onChange={next => void change(next)} disabled={busy} /> : null}{error ? <Text style={{ color: '#8A2943' }}>{error}</Text> : null}</View>;
}
