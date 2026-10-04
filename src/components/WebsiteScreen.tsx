import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Text } from './AppTypography';
import { supabase } from '../lib/supabase';

type Slide = { image: string; caption: string };
type Content = { [key:string]: string | Slide[] };
const fields = [
 ['heroTitle','Opening title','Start.\nBuild. Scale.'],
 ['heroDescription','Opening description','Preorder products and practical reseller packages selected for new and growing sellers.'],
 ['introTitle','Introduction title','More than a catalogue.\nA clearer way into reselling.'],
 ['introDescription','Introduction text','Choose individual products or ask VIAE to prepare a product mix for your budget and customers. Every preorder has clear payment stages and an expected waiting period.'],
 ['storyTitle','Featured story title','Small beginnings.\nNew possibilities.'],
 ['storyDescription','Featured story text','Explore the product world, from flexible 3D prints to supplies and accessories for your next business idea.'],
 ['closingText','Closing message','Let us help you find your way forward.'],
 ['shippingNote','Delivery note','Local Philippine delivery is separate from the product price.'],
];
export function WebsiteScreen({businessId,onBack}:{businessId:string;onBack:()=>void}) {
 const [content,setContent]=useState<Content>({});
 const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''); const [ready,setReady]=useState(false);
 useEffect(()=>{ let alive=true; supabase.from('storefront_drafts').select('content').eq('business_id',businessId).maybeSingle().then(({data,error})=>{if(!alive)return;setLoading(false);setReady(!!data&&!error);if(error||!data)setMessage(error?.message||'Website controls are not enabled for this shop.');else setContent(data.content as Content);});return()=>{alive=false};},[businessId]);
 const slides=(content.slides || []) as Slide[];
 const update=(key:string,value:string|Slide[])=>setContent(current=>({...current,[key]:value}));
 async function save(publish:boolean) {
  setBusy(true);setMessage('');
  try {
   const clean={...content}; fields.forEach(([key,,fallback])=>{clean[key]=String(clean[key]??fallback).trim()||fallback;});
   const payload={content:clean,updated_at:new Date().toISOString()};
   const draft=await supabase.from('storefront_drafts').update(payload).eq('business_id',businessId).select('business_id').single();if(draft.error)throw draft.error;
   if(publish){const result=await supabase.from('storefront_pages').update(payload).eq('business_id',businessId).select('business_id').single();if(result.error)throw result.error;}
   setMessage(publish?'Published. Refresh the VIAE website to see your changes.':'Draft saved. The public website has not changed.');
  }catch(error){setMessage(error instanceof Error?error.message:(error as {message?:string}).message||'Could not save. Please try again.');}finally{setBusy(false);}
 }
 async function addPhoto() {
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1});if(result.canceled)return;
  setBusy(true);setMessage('');
  try {const asset=result.assets[0];const resized=await ImageManipulator.manipulateAsync(asset.uri,[asset.width>=asset.height?{resize:{width:1400}}:{resize:{height:1400}}],{compress:.78,format:ImageManipulator.SaveFormat.JPEG});
   const bytes=await (await fetch(resized.uri)).arrayBuffer(); const path=`${businessId}/website/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
   const {error}=await supabase.storage.from('product-images').upload(path,bytes,{contentType:'image/jpeg'});if(error)throw error;
   update('slides',[...slides,{image:supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl,caption:''}]);
   setMessage('Photo added to this draft. Save or publish to keep it in the carousel.');
  }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }
 const button=(label:string,action:()=>void,secondary=false)=><Pressable disabled={busy||!ready} onPress={action} style={[s.button,secondary&&s.secondary,(busy||!ready)&&{opacity:.5}]}><Text style={[s.buttonText,secondary&&{color:'#650f1c'}]}>{label}</Text></Pressable>;
 return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <Pressable onPress={onBack}><Text style={s.back}>← Back to VIAE</Text></Pressable>
  <Text style={s.title}>VIAE website</Text><Text style={s.help}>Edit your homepage and featured images. Save a draft, then publish when ready.</Text>
  {loading?<ActivityIndicator/>:<><View style={s.row}>{button('Open website',()=>void Linking.openURL('https://ecommerce-ai-store.vercel.app/'),true)}</View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  {ready&&<><View style={s.card}><Text style={s.heading}>Homepage text</Text>{fields.map(([key,label,fallback])=><View key={key} style={s.field}><Text style={s.label}>{label}</Text><TextInput editable={!busy} multiline style={s.input} value={String(content[key]??fallback)} onChangeText={value=>update(key,value)} accessibilityLabel={label}/></View>)}</View>
  <View style={s.card}><Text style={s.heading}>Featured images</Text><Text style={s.help}>One photo shows as a story image. Add more for a carousel. Customers can swipe or use the arrows. Your existing dragon image stays until you add a replacement.</Text>
   {slides.map((slide,index)=><View key={`${slide.image}-${index}`} style={s.slide}><Image source={{uri:slide.image}} style={s.image} resizeMode="contain"/><TextInput editable={!busy} style={s.input} placeholder="Image description" value={slide.caption} onChangeText={caption=>update('slides',slides.map((item,i)=>i===index?{...item,caption}:item))}/><View style={s.row}>{index>0&&button('Move up',()=>{const next=[...slides];[next[index-1],next[index]]=[next[index],next[index-1]];update('slides',next);},true)}{button('Remove from carousel',()=>update('slides',slides.filter((_,i)=>i!==index)),true)}</View></View>)}
   {button('Upload photo',()=>void addPhoto(),true)}</View>
  <View style={s.row}>{button('Save draft',()=>void save(false),true)}{button('Publish website',()=>void save(true))}</View><Text style={s.help}>Products and prices are managed in Products. This editor does not change orders, payments or Pixelbug.</Text></>}
  </>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:20,gap:18,maxWidth:960,width:'100%',alignSelf:'center',paddingBottom:100},back:{color:'#650f1c',fontSize:16},title:{fontSize:28,fontWeight:'700'},heading:{fontSize:21,fontWeight:'700'},help:{fontSize:15,lineHeight:23,color:'#59616d'},card:{padding:20,borderWidth:1,borderColor:'#e5e7eb',borderRadius:16,gap:16,backgroundColor:'white'},field:{gap:8},label:{fontSize:15,fontWeight:'600'},input:{borderWidth:1,borderColor:'#ccd1d8',borderRadius:9,padding:12,fontSize:16,minHeight:48,color:'#202735',backgroundColor:'white'},row:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{padding:14,backgroundColor:'#650f1c',borderRadius:10,alignItems:'center'},secondary:{backgroundColor:'#f8edf0',borderWidth:1,borderColor:'#dec4cc'},buttonText:{color:'white',fontSize:15,fontWeight:'600'},message:{padding:14,backgroundColor:'#eef3fb',color:'#203650',fontSize:15},slide:{gap:10,paddingBottom:15,borderBottomWidth:1,borderColor:'#e5e7eb'},image:{width:'100%',height:220}});
