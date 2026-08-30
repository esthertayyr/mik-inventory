import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase";
import { peso } from "@/src/lib/format";

const FONT = Platform.select({ web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", ios: "System", android: "sans-serif" });
function Text({ style, ...props }: TextProps) { return <RNText {...props} style={[{ fontFamily: FONT }, style]} />; }
function TextInput({ style, ...props }: TextInputProps) { return <RNTextInput {...props} style={[{ fontFamily: FONT }, style]} />; }

type OrderStatus = "new" | "making" | "ready" | "completed" | "cancelled";
type PaymentStatus = "unpaid" | "partial" | "paid";
type Order = {
  id: string; order_number: number; title: string; image_url: string | null;
  customer_name: string | null; customer_contact: string | null; source: string;
  quantity: number; order_date: string; target_date: string | null;
  total_price: number; amount_paid: number; payment_status: PaymentStatus;
  payment_channel: string | null; payment_reference: string | null; notes: string | null;
  status: OrderStatus; created_at: string; updated_at: string;
};
type Source = { id: string; name: string };
type Form = {
  title: string; customer_name: string; customer_contact: string; source: string;
  custom_source: string; quantity: string; order_date: string; target_date: string;
  total_price: string; amount_paid: string; payment_channel: string;
  payment_reference: string; notes: string; image_uri: string;
};

const C = { ink: "#101318", muted: "#626A73", navy: "#142C47", green: "#264A3B", ruby: "#65243A", amber: "#795C2D", border: "#E0E3E7", pale: "#F6F7F8", white: "#FFF" };
const today = () => new Date().toLocaleDateString("en-CA");
const emptyForm = (): Form => ({ title: "", customer_name: "", customer_contact: "", source: "Facebook", custom_source: "", quantity: "1", order_date: today(), target_date: "", total_price: "", amount_paid: "", payment_channel: "", payment_reference: "", notes: "", image_uri: "" });
const statusLabel: Record<OrderStatus,string> = { new: "New", making: "Making", ready: "Ready", completed: "Completed", cancelled: "Cancelled" };
const statusIcon: Record<OrderStatus,keyof typeof Ionicons.glyphMap> = { new: "sparkles-outline", making: "construct-outline", ready: "checkmark-circle-outline", completed: "bag-check-outline", cancelled: "close-circle-outline" };
const paymentLabel: Record<PaymentStatus,string> = { unpaid: "Unpaid", partial: "Partially paid", paid: "Paid" };
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function dueInfo(order: Order) {
  if (!order.target_date || order.status === "completed" || order.status === "cancelled") return null;
  const due = new Date(`${order.target_date}T12:00:00`);
  const base = new Date(`${today()}T12:00:00`);
  const days = Math.round((due.getTime() - base.getTime()) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: C.ruby };
  if (days === 0) return { text: "Due today", color: C.ruby };
  if (days <= 3) return { text: `${days}d left`, color: C.amber };
  return { text: `${days}d left`, color: C.green };
}

export function OrdersScreen({ businessId, locationId }: { businessId: string; locationId: string }) {
  const [orders,setOrders] = useState<Order[]>([]);
  const [sources,setSources] = useState<Source[]>([]);
  const [loading,setLoading] = useState(true);
  const [view,setView] = useState<OrderStatus | "active" | "all">("active");
  const [search,setSearch] = useState("");
  const [sourceFilter,setSourceFilter] = useState("All");
  const [editing,setEditing] = useState<Order | "new" | null>(null);
  const [form,setForm] = useState<Form>(emptyForm);
  const [saving,setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{data:o,error},{data:s}] = await Promise.all([
      supabase.from("external_orders").select("*").eq("location_id",locationId).order("target_date",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false}),
      supabase.from("order_sources").select("id,name").eq("business_id",businessId).eq("active",true).order("sort_order"),
    ]);
    if (error) Alert.alert("Orders not loaded",error.message);
    setOrders((o ?? []) as Order[]); setSources((s ?? []) as Source[]); setLoading(false);
  },[businessId,locationId]);
  useEffect(()=>{ void load(); },[load]);

  const counts = useMemo(()=>({
    active: orders.filter(o=>!["completed","cancelled"].includes(o.status)).length,
    new: orders.filter(o=>o.status==="new").length,
    making: orders.filter(o=>o.status==="making").length,
    ready: orders.filter(o=>o.status==="ready").length,
  }),[orders]);
  const filtered = orders.filter(o => {
    const statusOk = view === "all" || (view === "active" ? !["completed","cancelled"].includes(o.status) : o.status === view);
    const sourceOk = sourceFilter === "All" || o.source === sourceFilter;
    const q=search.trim().toLowerCase();
    return statusOk && sourceOk && (!q || `${o.title} ${o.customer_name ?? ""} ${o.customer_contact ?? ""} ${o.order_number}`.toLowerCase().includes(q));
  });
  const urgent = orders.filter(o=>{ const d=dueInfo(o); return d && d.color!==C.green; }).length;
  const paymentSummary = useMemo(() => {
    const paid = orders.reduce((sum,o)=>sum+Number(o.amount_paid),0);
    const outstanding = orders.filter(o=>o.status!=="cancelled").reduce((sum,o)=>sum+Math.max(0,Number(o.total_price)-Number(o.amount_paid)),0);
    const sourceCounts = orders.reduce<Record<string,number>>((acc,o)=>(acc[o.source]=(acc[o.source]??0)+1,acc),{});
    const topSource = Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "—";
    return { paid, outstanding, topSource };
  },[orders]);

  const startNew = () => { setForm(emptyForm()); setEditing("new"); };
  const startEdit = (o: Order) => { setForm({ title:o.title,customer_name:o.customer_name??"",customer_contact:o.customer_contact??"",source:o.source,custom_source:"",quantity:String(o.quantity),order_date:o.order_date,target_date:o.target_date??"",total_price:String(o.total_price),amount_paid:String(o.amount_paid),payment_channel:o.payment_channel??"",payment_reference:o.payment_reference??"",notes:o.notes??"",image_uri:o.image_url??"" }); setEditing(o); };
  const duplicate = (o: Order) => { startEdit(o); setForm(f=>({...f,title:`${o.title} copy`,order_date:today(),target_date:"",amount_paid:"",payment_channel:"",payment_reference:""})); setEditing("new"); };
  const choosePhoto = async () => {
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted) return Alert.alert("Photo access needed","Allow Mik to choose an order photo.");
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:1});
    if(!result.canceled) setForm(f=>({...f,image_uri:result.assets[0].uri}));
  };
  const save = async () => {
    const quantity=Number(form.quantity), total=Number(form.total_price), paid=Number(form.amount_paid || 0);
    const source=form.source==="Other" ? form.custom_source.trim() || "Other" : form.source;
    if(!form.title.trim()) return Alert.alert("Order name needed","Enter what the customer ordered.");
    if(!Number.isInteger(quantity)||quantity<1) return Alert.alert("Check quantity","Quantity must be at least 1.");
    if(!Number.isFinite(total)||total<0||!Number.isFinite(paid)||paid<0||paid>total) return Alert.alert("Check payment","Paid amount cannot be greater than the total price.");
    if(form.target_date && (!/^\d{4}-\d{2}-\d{2}$/.test(form.target_date)||form.target_date<form.order_date)) return Alert.alert("Check target date","Use YYYY-MM-DD and choose a date on or after the order date.");
    if(paid>0&&!form.payment_channel.trim()) return Alert.alert("Payment method needed","Choose where or how the customer paid.");
    setSaving(true);
    const payment_status:PaymentStatus=paid<=0?"unpaid":paid>=total?"paid":"partial";
    const payload={business_id:businessId,location_id:locationId,title:form.title.trim(),customer_name:form.customer_name.trim()||null,customer_contact:form.customer_contact.trim()||null,source,quantity,order_date:form.order_date,target_date:form.target_date||null,total_price:total,amount_paid:paid,payment_status,payment_channel:form.payment_channel.trim()||null,payment_reference:form.payment_reference.trim()||null,notes:form.notes.trim()||null};
    let id:string|undefined;
    if(editing==="new") {
      const {data,error}=await supabase.from("external_orders").insert({...payload,created_by:(await supabase.auth.getUser()).data.user?.id}).select("id").single();
      if(error){setSaving(false);return Alert.alert("Order not saved",error.message);} id=data.id;
    } else if(editing) {
      const {error}=await supabase.from("external_orders").update(payload).eq("id",editing.id);
      if(error){setSaving(false);return Alert.alert("Order not saved",error.message);} id=editing.id;
    }
    if(id && form.image_uri && !form.image_uri.startsWith("http")) {
      try {
        const resized=await ImageManipulator.manipulateAsync(form.image_uri,[{resize:{width:900}}],{compress:.82,format:ImageManipulator.SaveFormat.JPEG});
        const response=await fetch(resized.uri); const path=`${businessId}/orders/${id}.jpg`;
        const {error}=await supabase.storage.from("product-images").upload(path,await response.arrayBuffer(),{contentType:"image/jpeg",upsert:true});
        if(error) throw error;
        const image_url=`${supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
        await supabase.from("external_orders").update({image_url}).eq("id",id);
      } catch { Alert.alert("Order saved without photo","The order is safe, but the photo could not be uploaded."); }
    }
    if(form.source==="Other"&&source!=="Other") await supabase.from("order_sources").upsert({business_id:businessId,name:source},{onConflict:"business_id,name"});
    setSaving(false); setEditing(null); await load(); Alert.alert("Order saved","It is now in the production queue.");
  };
  const setStatus = async (o:Order,status:OrderStatus) => {
    const action=async()=>{const {error}=await supabase.from("external_orders").update({status}).eq("id",o.id);if(error)return Alert.alert("Order not updated",error.message);await load();};
    if(status==="cancelled") return Alert.alert("Cancel this order?","It will remain in history and will not be deleted.",[{text:"Keep order",style:"cancel"},{text:"Cancel order",style:"destructive",onPress:()=>void action()}]);
    await action();
  };
  const exportOrders = async () => {
    const rows=[["Order","Name","Customer","Contact","Source","Order date","Target date","Status","Quantity","Total price","Amount paid","Balance","Payment status","Paid via","Reference","Notes"],...orders.map(o=>[`ORD-${o.order_number}`,o.title,o.customer_name??"",o.customer_contact??"",o.source,o.order_date,o.target_date??"",statusLabel[o.status],o.quantity,o.total_price,o.amount_paid,Number(o.total_price)-Number(o.amount_paid),paymentLabel[o.payment_status],o.payment_channel??"",o.payment_reference??"",o.notes??""])];
    const csv="\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\n"); const filename=`mik-orders-${today()}.csv`;
    if(Platform.OS==="web"){const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);return;}
    const file=new File(Paths.cache,filename);file.create();file.write(csv);await Sharing.shareAsync(file.uri);
  };

  if(editing) return <OrderForm form={form} setForm={setForm} sources={sources} saving={saving} editing={editing!=="new"} onBack={()=>setEditing(null)} onSave={save} onPhoto={choosePhoto}/>;
  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.headingRow}><View><Text style={s.title}>Orders</Text><Text style={s.subtitle}>Custom and outside orders</Text></View><Pressable style={s.add} onPress={startNew}><Ionicons name="add" size={25} color={C.white}/><Text style={s.addText}>New order</Text></Pressable></View>
    <View style={s.hero}><Text style={s.heroKicker}>PRODUCTION QUEUE</Text><Text style={s.heroValue}>{counts.active} active</Text><Text style={s.heroHelp}>{urgent?`${urgent} need attention today`:"Everything is on schedule"}</Text></View>
    <View style={s.summaryRow}><View style={s.summaryItem}><Text style={s.factLabel}>PAID ELSEWHERE</Text><Text style={s.summaryValue}>{peso(paymentSummary.paid)}</Text></View><View style={s.summaryItem}><Text style={s.factLabel}>OUTSTANDING</Text><Text style={s.summaryValue}>{peso(paymentSummary.outstanding)}</Text></View><View style={s.summaryItem}><Text style={s.factLabel}>TOP SOURCE</Text><Text style={s.summaryValue} numberOfLines={1}>{paymentSummary.topSource}</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
      {([['active',`Active ${counts.active}`],['new',`New ${counts.new}`],['making',`Making ${counts.making}`],['ready',`Ready ${counts.ready}`],['completed','Completed'],['all','All']] as const).map(([id,label])=><Pressable key={id} style={[s.tab,view===id&&s.tabOn]} onPress={()=>setView(id)}><Text style={[s.tabText,view===id&&s.tabTextOn]}>{label}</Text></Pressable>)}
    </ScrollView>
    <View style={s.search}><Ionicons name="search" size={20} color={C.muted}/><TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search order or customer"/></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sourceRow}>{["All",...sources.map(x=>x.name)].map(x=><Pressable key={x} style={[s.sourceChip,sourceFilter===x&&s.sourceChipOn]} onPress={()=>setSourceFilter(x)}><Text style={[s.sourceText,sourceFilter===x&&s.sourceTextOn]}>{x}</Text></Pressable>)}</ScrollView>
    {loading?<ActivityIndicator size="large" color={C.navy}/>:filtered.length?filtered.map(o=><OrderCard key={o.id} order={o} onEdit={()=>startEdit(o)} onDuplicate={()=>duplicate(o)} onStatus={(st)=>void setStatus(o,st)}/>):<View style={s.empty}><Ionicons name="file-tray-outline" size={34} color={C.navy}/><Text style={s.emptyTitle}>No orders here</Text><Text style={s.emptyHelp}>Tap New order when a customer orders through Facebook, online, referral or walk-in.</Text></View>}
    <Pressable style={s.export} onPress={()=>void exportOrders()}><Ionicons name="download-outline" size={22} color={C.navy}/><Text style={s.exportText}>Export all orders for Excel</Text></Pressable>
  </ScrollView>;
}

function OrderCard({order,onEdit,onDuplicate,onStatus}:{order:Order;onEdit:()=>void;onDuplicate:()=>void;onStatus:(s:OrderStatus)=>void}) {
  const due=dueInfo(order); const balance=Number(order.total_price)-Number(order.amount_paid);
  const next:OrderStatus|null=order.status==="new"?"making":order.status==="making"?"ready":order.status==="ready"?"completed":null;
  return <View style={s.card}>
    <View style={s.cardTop}>{order.image_url?<Image source={{uri:order.image_url}} style={s.photo}/>:<View style={s.noPhoto}><Ionicons name="cube-outline" size={28} color={C.navy}/></View>}<View style={s.cardMain}><View style={s.numberRow}><Text style={s.number}>ORD-{order.order_number}</Text><View style={s.status}><Ionicons name={statusIcon[order.status]} size={14} color={order.status==="cancelled"?C.ruby:C.navy}/><Text style={[s.statusText,order.status==="cancelled"&&{color:C.ruby}]}>{statusLabel[order.status]}</Text></View></View><Text style={s.cardTitle} numberOfLines={2}>{order.title}</Text><Text style={s.meta}>{order.customer_name||"No customer name"} · {order.source}</Text></View></View>
    <View style={s.facts}><View><Text style={s.factLabel}>DUE</Text><Text style={[s.factValue,due&&{color:due.color}]}>{due?.text||order.target_date||"No date"}</Text></View><View><Text style={s.factLabel}>PRICE</Text><Text style={s.factValue}>{peso(Number(order.total_price))}</Text></View><View><Text style={s.factLabel}>PAYMENT</Text><Text style={[s.factValue,{color:order.payment_status==="paid"?C.green:order.payment_status==="partial"?C.amber:C.ruby}]}>{paymentLabel[order.payment_status]}</Text></View></View>
    {order.amount_paid>0?<Text style={s.paymentDetail}>{peso(Number(order.amount_paid))} paid via {order.payment_channel}{balance>0?` · ${peso(balance)} remaining`:""}</Text>:null}
    {next?<Pressable style={s.next} onPress={()=>onStatus(next)}><Text style={s.nextText}>{next==="making"?"Start making":next==="ready"?"Mark as ready":"Mark completed"}</Text><Ionicons name="arrow-forward" size={20} color={C.white}/></Pressable>:null}
    <View style={s.cardActions}><Pressable style={s.link} onPress={onEdit}><Ionicons name="create-outline" size={18} color={C.navy}/><Text style={s.linkText}>View / edit</Text></Pressable><Pressable style={s.link} onPress={onDuplicate}><Ionicons name="copy-outline" size={18} color={C.navy}/><Text style={s.linkText}>Duplicate</Text></Pressable>{!["completed","cancelled"].includes(order.status)?<Pressable style={s.link} onPress={()=>onStatus("cancelled")}><Text style={s.cancelText}>Cancel</Text></Pressable>:null}</View>
  </View>;
}

function OrderForm({form,setForm,sources,saving,editing,onBack,onSave,onPhoto}:{form:Form;setForm:Dispatch<SetStateAction<Form>>;sources:Source[];saving:boolean;editing:boolean;onBack:()=>void;onSave:()=>void;onPhoto:()=>void}) {
  const update=(key:keyof Form,value:string)=>setForm(f=>({...f,[key]:value})); const total=Number(form.total_price||0),paid=Number(form.amount_paid||0);
  return <ScrollView contentContainerStyle={s.page}>
    <Pressable style={s.back} onPress={onBack}><Ionicons name="arrow-back" size={23} color={C.ink}/><Text style={s.backText}>{editing?"Edit order":"New order"}</Text></Pressable>
    <Text style={s.formLead}>{editing?"Update the project details.":"What did the customer order?"}</Text>
    <Pressable style={s.photoPicker} onPress={onPhoto}>{form.image_uri?<Image source={{uri:form.image_uri}} style={s.formPhoto}/>:<><View style={s.photoCircle}><Ionicons name="camera-outline" size={28} color={C.white}/></View><Text style={s.photoTitle}>Add project photo</Text><Text style={s.photoHelp}>Optional, but useful for customised work</Text></>}</Pressable>
    <Field label="Order name *" value={form.title} onChangeText={v=>update("title",v)} placeholder="Example: Customised Gecko"/>
    <View style={s.two}><View style={s.half}><Field label="Customer name" value={form.customer_name} onChangeText={v=>update("customer_name",v)} placeholder="Optional"/></View><View style={s.half}><Field label="Contact" value={form.customer_contact} onChangeText={v=>update("customer_contact",v)} placeholder="Phone or username"/></View></View>
    <Text style={s.label}>Where did this order come from?</Text><View style={s.wrap}>{[...sources.map(x=>x.name),"Other"].filter((x,i,a)=>a.indexOf(x)===i).map(x=><Pressable key={x} style={[s.choice,form.source===x&&s.choiceOn]} onPress={()=>update("source",x)}><Text style={[s.choiceText,form.source===x&&s.choiceTextOn]}>{x}</Text></Pressable>)}</View>
    {form.source==="Other"?<Field label="Source name" value={form.custom_source} onChangeText={v=>update("custom_source",v)} placeholder="Example: Instagram"/>:null}
    <View style={s.two}><View style={s.half}><Field label="Quantity *" value={form.quantity} onChangeText={v=>update("quantity",v)} keyboardType="number-pad"/></View><View style={s.half}><Field label="Total price *" value={form.total_price} onChangeText={v=>update("total_price",v)} keyboardType="decimal-pad" placeholder="₱0"/></View></View>
    <View style={s.two}><View style={s.half}><Field label="Order date" value={form.order_date} onChangeText={v=>update("order_date",v)} placeholder="YYYY-MM-DD"/></View><View style={s.half}><Field label="Target date" value={form.target_date} onChangeText={v=>update("target_date",v)} placeholder="YYYY-MM-DD"/></View></View>
    <Text style={s.label}>Quick target date</Text><View style={s.wrap}>{[1,3,7,14].map(days=><Pressable key={days} style={s.choice} onPress={()=>{const d=new Date(`${form.order_date}T12:00:00`);d.setDate(d.getDate()+days);update("target_date",d.toLocaleDateString("en-CA"));}}><Text style={s.choiceText}>+{days} days</Text></Pressable>)}</View>
    <View style={s.paymentBox}><View style={s.paymentHead}><Ionicons name="card-outline" size={25} color={C.navy}/><View><Text style={s.paymentTitle}>Outside payment</Text><Text style={s.photoHelp}>Record what was already paid elsewhere.</Text></View></View><Field label="Amount paid" value={form.amount_paid} onChangeText={v=>update("amount_paid",v)} keyboardType="decimal-pad" placeholder="₱0"/><Text style={s.balance}>Balance: {peso(Math.max(0,total-paid))}</Text><Text style={s.label}>Paid via</Text><View style={s.wrap}>{["Cash","GCash","Bank transfer","Facebook / online","Other"].map(x=><Pressable key={x} style={[s.choice,form.payment_channel===x&&s.choiceOn]} onPress={()=>update("payment_channel",x)}><Text style={[s.choiceText,form.payment_channel===x&&s.choiceTextOn]}>{x}</Text></Pressable>)}</View><Field label="Payment reference" value={form.payment_reference} onChangeText={v=>update("payment_reference",v)} placeholder="Optional receipt or reference"/></View>
    <Field label="Customisation notes" value={form.notes} onChangeText={v=>update("notes",v)} placeholder="Colour, size, design, delivery or other details" multiline/>
    <Pressable style={[s.save,saving&&{opacity:.6}]} onPress={onSave} disabled={saving}><Ionicons name="checkmark" size={22} color={C.white}/><Text style={s.saveText}>{saving?"Saving…":editing?"Save changes":"Add to orders"}</Text></Pressable>
  </ScrollView>;
}

function Field(props:TextInputProps&{label:string}) { return <View><Text style={s.label}>{props.label}</Text><TextInput {...props} style={[s.input,props.multiline&&s.notes]} placeholderTextColor="#8A9199"/></View>; }

const s=StyleSheet.create({
  page:{paddingTop:16,paddingBottom:40},headingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},title:{fontSize:30,fontWeight:"900",color:C.ink,letterSpacing:-.8},subtitle:{marginTop:2,fontSize:15,color:C.muted},add:{minHeight:46,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:6,borderRadius:10,backgroundColor:C.navy},addText:{color:C.white,fontSize:14,fontWeight:"900"},
  hero:{marginTop:18,padding:22,borderRadius:14,backgroundColor:C.navy},heroKicker:{color:"#D8E0E7",fontSize:11,fontWeight:"900",letterSpacing:1.6},heroValue:{marginTop:6,color:C.white,fontSize:34,fontWeight:"900"},heroHelp:{marginTop:5,color:C.white,fontSize:14,fontWeight:"600"},tabs:{gap:8,paddingVertical:14},tab:{minHeight:44,paddingHorizontal:15,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},tabOn:{backgroundColor:C.ink,borderColor:C.ink},tabText:{color:C.ink,fontSize:13,fontWeight:"800"},tabTextOn:{color:C.white},
  summaryRow:{marginTop:10,flexDirection:"row",gap:7},summaryItem:{minWidth:0,flex:1,padding:11,borderRadius:10,backgroundColor:C.pale},summaryValue:{marginTop:5,color:C.ink,fontSize:13,fontWeight:"900"},
  search:{minHeight:52,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:9,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},searchInput:{flex:1,minHeight:50,color:C.ink,fontSize:16},sourceRow:{gap:7,paddingVertical:10},sourceChip:{minHeight:36,paddingHorizontal:12,alignItems:"center",justifyContent:"center",borderRadius:18,backgroundColor:C.pale},sourceChipOn:{backgroundColor:C.green},sourceText:{color:C.ink,fontSize:12,fontWeight:"800"},sourceTextOn:{color:C.white},
  card:{marginTop:12,padding:14,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.white},cardTop:{flexDirection:"row",gap:12},photo:{width:78,height:78,borderRadius:10,resizeMode:"contain",backgroundColor:C.pale},noPhoto:{width:78,height:78,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:C.pale},cardMain:{flex:1},numberRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6},number:{color:C.muted,fontSize:11,fontWeight:"900",letterSpacing:.7},status:{paddingHorizontal:8,paddingVertical:5,flexDirection:"row",alignItems:"center",gap:4,borderRadius:12,backgroundColor:C.pale},statusText:{color:C.navy,fontSize:10,fontWeight:"900"},cardTitle:{marginTop:7,color:C.ink,fontSize:19,lineHeight:23,fontWeight:"900"},meta:{marginTop:5,color:C.muted,fontSize:13,fontWeight:"600"},facts:{marginTop:14,paddingTop:12,flexDirection:"row",justifyContent:"space-between",borderTopWidth:1,borderTopColor:C.border},factLabel:{color:C.muted,fontSize:9,fontWeight:"900",letterSpacing:1},factValue:{marginTop:4,color:C.ink,fontSize:13,fontWeight:"900"},paymentDetail:{marginTop:10,color:C.muted,fontSize:12,fontWeight:"700"},next:{minHeight:50,marginTop:13,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderRadius:10,backgroundColor:C.navy},nextText:{color:C.white,fontSize:15,fontWeight:"900"},cardActions:{minHeight:44,flexDirection:"row",alignItems:"center",gap:18},link:{flexDirection:"row",alignItems:"center",gap:5},linkText:{color:C.navy,fontSize:12,fontWeight:"800"},cancelText:{color:C.ruby,fontSize:12,fontWeight:"900"},
  empty:{marginTop:18,padding:28,alignItems:"center",borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.pale},emptyTitle:{marginTop:10,color:C.ink,fontSize:19,fontWeight:"900"},emptyHelp:{marginTop:5,color:C.muted,fontSize:14,lineHeight:20,textAlign:"center"},export:{minHeight:54,marginTop:18,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,borderWidth:1,borderColor:C.navy,borderRadius:10,backgroundColor:C.white},exportText:{color:C.navy,fontSize:14,fontWeight:"900"},
  back:{minHeight:48,flexDirection:"row",alignItems:"center",gap:9},backText:{color:C.ink,fontSize:17,fontWeight:"900"},formLead:{marginTop:10,color:C.ink,fontSize:28,lineHeight:34,fontWeight:"900",letterSpacing:-.7},photoPicker:{minHeight:170,marginTop:18,alignItems:"center",justifyContent:"center",overflow:"hidden",borderWidth:1,borderStyle:"dashed",borderColor:C.border,borderRadius:12,backgroundColor:C.pale},formPhoto:{width:"100%",height:230,resizeMode:"contain"},photoCircle:{width:52,height:52,alignItems:"center",justifyContent:"center",borderRadius:26,backgroundColor:C.navy},photoTitle:{marginTop:10,color:C.ink,fontSize:16,fontWeight:"900"},photoHelp:{marginTop:3,color:C.muted,fontSize:12,lineHeight:17},label:{marginTop:15,marginBottom:6,color:C.ink,fontSize:13,fontWeight:"900"},input:{minHeight:54,paddingHorizontal:14,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white,color:C.ink,fontSize:16},notes:{minHeight:110,paddingTop:14,textAlignVertical:"top"},two:{flexDirection:"row",gap:10},half:{flex:1},wrap:{flexDirection:"row",flexWrap:"wrap",gap:7},choice:{minHeight:42,paddingHorizontal:13,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:9,backgroundColor:C.white},choiceOn:{borderColor:C.navy,backgroundColor:C.navy},choiceText:{color:C.ink,fontSize:12,fontWeight:"800"},choiceTextOn:{color:C.white},paymentBox:{marginTop:18,padding:15,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.pale},paymentHead:{flexDirection:"row",alignItems:"center",gap:10},paymentTitle:{color:C.ink,fontSize:18,fontWeight:"900"},balance:{marginTop:8,color:C.green,fontSize:19,fontWeight:"900"},save:{minHeight:58,marginTop:22,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,borderRadius:10,backgroundColor:C.navy},saveText:{color:C.white,fontSize:16,fontWeight:"900"},
});
