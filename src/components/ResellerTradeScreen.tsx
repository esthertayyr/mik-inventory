import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View, Alert } from 'react-native';
import { Text, TextInput } from './AppTypography';
import { ExpenseDatePicker } from './ExpensesScreen';
import { supabase } from '../lib/supabase';
import { userNotice } from '../lib/userNotice';
import { peso } from '../lib/format';
import { ResellerPackageCheckout } from './ResellerPackageCheckout';

type Variant={id:string;option_value:string;selling_price_php:number|null;stock_units:number};
type Product={id:string;name:string;selling_price_php:number|null;source_product_options:Variant[];source_product_images:{image_url:string}[]};
export type TradeEntry={id:string;kind:'sale'|'purchase';product_name:string;variant_name:string;quantity:number;entry_date:string;payment_date:string|null;amount_php:number;payment_method:string;status:string;received_quantity:number;needs_repacking:boolean;pack_size:number;packed_quantity:number;notes:string|null};
const today=()=>{const d=new Date();return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;};
const display=(date:string)=>date.split('-').reverse().join('-');
const dateIso=(date:string)=>{const m=date.match(/^(\d{2})-(\d{2})-(\d{4})$/);if(!m)return null;const iso=`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(`${iso}T12:00:00`);return !Number.isNaN(d.getTime())&&d.getDate()===Number(m[1])&&d.getMonth()+1===Number(m[2])?iso:null;};
const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);});

export function ResellerTradeScreen({businessId,locationId,kind,onBack}:{businessId:string;locationId:string;kind:'sale'|'purchase';onBack:()=>void}){
 const purchase=kind==='purchase';
 const [packageOpen,setPackageOpen]=useState(false);
 const [packageSales,setPackageSales]=useState<{id:string;package_name:string;quantity:number;total_price_php:number;reseller_preorder_payments:{payment_date:string;payment_method:string}[]}[]>([]);
 const [products,setProducts]=useState<Product[]>([]),[rows,setRows]=useState<TradeEntry[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [form,setForm]=useState(false),[productId,setProductId]=useState(''),[variantId,setVariantId]=useState(''),[quantity,setQuantity]=useState('1'),[amount,setAmount]=useState(''),[rate,setRate]=useState('45');
 const [date,setDate]=useState(today),[paidDate,setPaidDate]=useState(today),[paid,setPaid]=useState(true),[method,setMethod]=useState('cash'),[notes,setNotes]=useState(''),[repack,setRepack]=useState(false),[packSize,setPackSize]=useState('10');
 const [receipt,setReceipt]=useState<TradeEntry|null>(null),[received,setReceived]=useState('');
 const [paymentEntry,setPaymentEntry]=useState<TradeEntry|null>(null);
 const [busy,setBusy]=useState(false);const busyRef=useRef(false),request=useRef(uuid());
 const load=useCallback(async()=>{setLoading(true);setError('');try{const [a,b,c]=await Promise.all([
  supabase.from('source_products').select('id,name,selling_price_php,source_product_options(id,option_value,selling_price_php,stock_units),source_product_images(image_url)').eq('business_id',businessId).eq('status','active').order('name'),
  supabase.from('reseller_trade_entries').select('*').eq('business_id',businessId).eq('location_id',locationId).eq('kind',kind).order('entry_date',{ascending:false}).order('created_at',{ascending:false}),
  purchase?Promise.resolve({data:[],error:null}):supabase.from('reseller_preorders').select('id,package_name,quantity,total_price_php,reseller_preorder_payments(payment_date,payment_method)').eq('business_id',businessId).eq('location_id',locationId).eq('direct_sale',true).order('created_at',{ascending:false})]);
  if(a.error)throw a.error;if(b.error)throw b.error;if(c.error)throw c.error;setProducts((a.data??[]) as Product[]);setRows((b.data??[]) as TradeEntry[]);setPackageSales((c.data??[]) as typeof packageSales);
 }catch(e){setError((e as Error).message);}finally{setLoading(false);}},[businessId,locationId,kind]);
 useEffect(()=>{void load();setForm(false);},[load]);
 const product=products.find(p=>p.id===productId);
 const choose=(p:Product)=>{setProductId(p.id);setVariantId('');setAmount(purchase?'':String(p.selling_price_php??''));};
 const open=()=>{setProductId('');setVariantId('');setQuantity('1');setAmount('');setDate(today());setPaidDate(today());setPaid(true);setNotes('');setRepack(false);setMethod('cash');request.current=uuid();setForm(true);};
 const save=async()=>{
  if(busyRef.current)return;
  const q=Number(quantity),value=Number(amount),fx=Number(rate),entryDate=dateIso(date),paymentDate=dateIso(paidDate);
  if(!product)return userNotice('Choose a product','Only official products can be selected.');
  if(product.source_product_options.length&&!variantId)return userNotice('Choose a variant','Select the exact colour, size or pack.');
  if(!Number.isInteger(q)||q<=0||!Number.isFinite(value)||value<=0)return userNotice('Check quantity and price','Use a whole quantity and a price greater than zero.');
  if(!entryDate||(paid&&!paymentDate))return userNotice('Choose the dates','Choose a valid order date and payment date.');
  if(purchase&&(!Number.isFinite(fx)||fx<=0))return userNotice('Check exchange rate','Enter pesos per SGD.');
  if(repack&&(!Number.isInteger(Number(packSize))||Number(packSize)<1))return userNotice('Check pack size','Enter how many pieces go in each pack.');
  busyRef.current=true;setBusy(true);
  try{const {error}=await supabase.from('reseller_trade_entries').insert({request_id:request.current,business_id:businessId,location_id:locationId,kind,source_product_id:product.id,source_product_option_id:variantId||null,product_name:product.name,variant_name:'',quantity:q,entry_date:entryDate,payment_date:paid?paymentDate:null,payment_method:method,amount_php:Math.round((purchase?value*fx:value*q)*100)/100,cost_sgd:purchase?value:null,exchange_rate:purchase?fx:null,status:purchase?'ordered':'completed',needs_repacking:purchase&&repack,pack_size:repack?Number(packSize):1,notes:notes.trim()||null});
   if(error&&error.code!=='23505')throw error;setForm(false);await load();userNotice(purchase?'Purchase recorded':'Sale recorded',purchase?'Update the quantity received when it arrives. Do not enter this purchase again in Expenses.':'The payment appears in Reports. Do not record a preorder payment here.');
  }catch(e){userNotice('Not saved',(e as Error).message);}finally{busyRef.current=false;setBusy(false);}
 };
 const update=async(row:TradeEntry,patch:Partial<TradeEntry>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);try{const {error}=await supabase.from('reseller_trade_entries').update(patch).eq('id',row.id).eq('business_id',businessId).select('id').single();if(error)throw error;setReceipt(null);setPaymentEntry(null);await load();}catch(e){userNotice('Not updated',(e as Error).message);}finally{busyRef.current=false;setBusy(false);}};
 const cancel=(row:TradeEntry)=>{const action=()=>void update(row,{status:'cancelled'});if(Platform.OS==='web'){if(globalThis.confirm('Cancel this entry? It stays in the history and is excluded from money totals.'))action();}else Alert.alert('Cancel this entry?','Keep a history of the correction.',[{text:'Keep',style:'cancel'},{text:'Cancel entry',style:'destructive',onPress:action}]);};
 if(packageOpen)return <ResellerPackageCheckout businessId={businessId} locationId={locationId} immediate onCancel={()=>setPackageOpen(false)} onSaved={()=>{setPackageOpen(false);void load();}}/>;
 return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <Button label={form||receipt||paymentEntry?'Back to list':'← Home'} onPress={()=>{if(form||receipt||paymentEntry){setForm(false);setReceipt(null);setPaymentEntry(null);}else onBack();}} secondary/>
  <Text style={s.title}>{purchase?'Supplier purchases':'Sales'}</Text>
  <Text style={s.help}>{purchase?'Record what you bought, what you paid and what arrived.':'Record a fully paid direct sale. Record customer preorder payments under Pre-orders instead.'}</Text>
  {!purchase&&!form&&!receipt&&!paymentEntry?<><Button label="Sell a reseller package" onPress={()=>setPackageOpen(true)}/>{packageSales.map(row=><View key={row.id} style={s.card}><Text style={s.heading}>{row.package_name} × {row.quantity}</Text><Text style={s.help}>Package sold · {row.reseller_preorder_payments[0]?.payment_date?display(row.reseller_preorder_payments[0].payment_date):''} · {row.reseller_preorder_payments[0]?.payment_method}</Text><Text style={s.heading}>{peso(Number(row.total_price_php))}</Text><Text style={s.help}>Included product stock deducted.</Text></View>)}</>:null}
  {error?<Text style={s.warning}>{error}</Text>:null}
  {paymentEntry?<View style={s.card}><Text style={s.heading}>Pay supplier · {peso(Number(paymentEntry.amount_php))}</Text><ExpenseDatePicker label="Date paid · Required" value={paidDate} onChange={setPaidDate}/><View style={s.choices}>{['cash','gcash','bank','other'].map(m=><Button key={m} label={m==='gcash'?'GCash':m} secondary={method!==m} onPress={()=>setMethod(m)}/>)}</View><Button label="Record full payment" disabled={busy} onPress={()=>{const d=dateIso(paidDate);if(!d)return userNotice('Choose payment date');void update(paymentEntry,{payment_date:d,payment_method:method});}}/></View>:receipt?<View style={s.card}><Text style={s.heading}>{receipt.product_name} · {receipt.variant_name}</Text><Field label={`Total pieces received so far · Ordered ${receipt.quantity}`} value={received} onChange={setReceived}/><Button label="Save received quantity" disabled={busy} onPress={()=>{const n=Number(received);if(!Number.isInteger(n)||n<receipt.received_quantity||n>receipt.quantity)return userNotice('Check count',`Enter a total between ${receipt.received_quantity} and ${receipt.quantity}.`);void update(receipt,{received_quantity:n,status:n===receipt.quantity?'received':'ordered'});}}/></View>:form?<>
   <ExpenseDatePicker label={purchase?'Order date · Required':'Sale date · Required'} value={date} onChange={setDate}/>
   <Text style={s.heading}>Choose an official product</Text>
   {!products.length?<Text style={s.help}>Make a product official in Products first.</Text>:null}
   <View style={s.choices}>{products.map(p=><Pressable key={p.id} style={[s.product,productId===p.id&&s.selected]} onPress={()=>choose(p)}>{p.source_product_images[0]?.image_url?<Image source={{uri:p.source_product_images[0].image_url}} style={s.photo} resizeMode="contain"/>:null}<Text style={s.label}>{p.name}</Text></Pressable>)}</View>
   {product?.source_product_options.length?<View style={s.choices}>{product.source_product_options.map(v=><Button key={v.id} label={v.option_value} secondary={variantId!==v.id} onPress={()=>{setVariantId(v.id);if(!purchase)setAmount(String(v.selling_price_php??product.selling_price_php??''));}}/>)}</View>:null}
   {!purchase&&product?<Text style={s.help}>{Number(quantity)*(product.source_product_options.find(v=>v.id===variantId)?.stock_units??1)} individual pieces will be deducted. For mixed shapes, use Sell a reseller package → Custom package.</Text>:null}
   <Field label={purchase?'Pieces ordered · Required':'Selections sold · Required'} value={quantity} onChange={setQuantity}/>
   <Field label={purchase?'Total buying cost · SGD · Include tax and all shipping':'Selling price per selected variant · PHP'} value={amount} onChange={setAmount}/>
   {purchase?<><Field label="1 SGD equals PHP · Required" value={rate} onChange={setRate}/><Text style={s.help}>This is the total cost for the whole purchase, not a price per piece. Tax is already included here.</Text><View style={s.choices}><Button label="Paid" secondary={!paid} onPress={()=>setPaid(true)}/><Button label="Not paid yet" secondary={paid} onPress={()=>setPaid(false)}/></View></>:null}
   {paid?<><ExpenseDatePicker label="Payment date · Required" value={paidDate} onChange={setPaidDate}/><View style={s.choices}>{['cash','gcash','bank','other'].map(m=><Button key={m} label={m==='gcash'?'GCash':m[0].toUpperCase()+m.slice(1)} secondary={method!==m} onPress={()=>setMethod(m)}/>)}</View></>:null}
   <Field label="Remarks · Optional" value={notes} onChange={setNotes} numeric={false}/>
   <View style={s.card}><Text style={s.heading}>Total {peso(purchase?Number(amount)*Number(rate):Number(amount)*Number(quantity))}</Text></View>
   <Button label={busy?'Saving…':purchase?'Save purchase':'Confirm sale'} disabled={busy} onPress={()=>void save()}/>
  </>:<><Button label={purchase?'Add purchase':'Add sale'} onPress={open}/>{loading?<Text style={s.help}>Loading…</Text>:!rows.length?<Text style={s.help}>No entries yet.</Text>:rows.map(row=><View key={row.id} style={s.card}><View style={s.row}><View style={s.flex}><Text style={s.heading}>{row.product_name}</Text><Text style={s.help}>{row.variant_name} · × {row.quantity} · {display(row.entry_date)}</Text></View><Text style={s.heading}>{peso(Number(row.amount_php))}</Text></View><Text style={s.label}>{row.status==='cancelled'?'Cancelled':purchase?`${row.received_quantity} of ${row.quantity} received${row.payment_date?' · Paid':' · Payment pending'}`:`Paid via ${row.payment_method}`}</Text>{row.notes?<Text style={s.help}>{row.notes}</Text>:null}
   {row.status!=='cancelled'?<View style={s.choices}>{purchase&&!row.payment_date?<Button label="Record full payment" disabled={busy} secondary onPress={()=>{setPaymentEntry(row);setPaidDate(today());setMethod(row.payment_method);}}/>:null}
    {purchase&&row.received_quantity<row.quantity?<Button label="Update received pieces" secondary onPress={()=>{setReceipt(row);setReceived(String(row.received_quantity));}}/>:null}
    <Button label="Cancel entry" secondary disabled={busy} onPress={()=>cancel(row)}/></View>:null}
   </View>)}</>}
 </ScrollView>;
}
function Field({label,value,onChange,numeric=true}:{label:string;value:string;onChange:(v:string)=>void;numeric?:boolean}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={onChange} keyboardType={numeric?'decimal-pad':'default'}/></View>;}
function Button({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:.5}]}><Text style={[s.buttonText,secondary&&{color:'#315FBE'}]}>{label}</Text></Pressable>;}
const s=StyleSheet.create({page:{width:'100%',maxWidth:1080,alignSelf:'center',padding:18,paddingBottom:90,gap:14},title:{fontSize:26,fontWeight:'700',color:'#151924'},heading:{fontSize:17,fontWeight:'700',color:'#151924'},help:{fontSize:14,lineHeight:21,color:'#626A78'},label:{fontSize:14,fontWeight:'600',color:'#343A47'},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E0E3EA',borderRadius:15,padding:16,gap:10},row:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center'},flex:{flex:1,minWidth:160},choices:{flexDirection:'row',flexWrap:'wrap',gap:9},product:{width:145,padding:10,borderWidth:1,borderColor:'#E0E3EA',borderRadius:12,gap:8},selected:{borderColor:'#315FBE',backgroundColor:'#EDF3FB'},photo:{width:'100%',height:100},field:{gap:7},input:{minHeight:48,borderWidth:1,borderColor:'#D9DDE5',borderRadius:10,padding:12,fontSize:16,color:'#151924',backgroundColor:'white'},button:{minHeight:44,paddingHorizontal:15,paddingVertical:11,backgroundColor:'#315FBE',borderRadius:10,alignItems:'center',justifyContent:'center'},secondary:{backgroundColor:'#EDF3FB',borderWidth:1,borderColor:'#CFDAEB'},buttonText:{fontSize:14,fontWeight:'600',color:'white'},warning:{color:'#8A2943',fontSize:14}});
