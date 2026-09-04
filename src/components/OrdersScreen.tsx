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
  useWindowDimensions,
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
  fulfilment_method: "collection"|"delivery"; fulfilled_at:string|null;
  is_past_order: boolean;
  status: OrderStatus; created_at: string; updated_at: string;
};
type Source = { id: string; name: string };
type Form = {
  title: string; customer_name: string; customer_contact: string; source: string;
  social_platform: string; custom_source: string; quantity: string; order_date: string; target_date: string;
  total_price: string; amount_paid: string; payment_channel: string;
  payment_reference: string; notes: string; image_uri: string;
  fulfilment_method:"collection"|"delivery";
  is_past_order:boolean;
  past_order_progress:"in_progress"|"completed";
};

const C = { ink: "#101318", muted: "#626A73", navy: "#142C47", green: "#264A3B", ruby: "#65243A", amber: "#795C2D", border: "#E0E3E7", pale: "#F6F7F8", white: "#FFF" };
const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const displayDate = (value: string | null) => {
  if (!value) return "";
  const match = value.slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
};
const inputDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && isoDate(parsed) === iso ? iso : null;
};
const SOCIAL_PLATFORMS = ["Facebook", "Instagram", "TikTok", "WhatsApp", "Other"];
const ORDER_SOURCES = ["Social media", "Walk-in", "Referral", "Marketplace", "Website", "Other"];
const sourceGroup = (source: string) => SOCIAL_PLATFORMS.includes(source)
  ? "Social media"
  : ORDER_SOURCES.includes(source) ? source : source === "Online" ? "Website" : source === "Word of mouth" ? "Referral" : "Other";
const emptyForm = (): Form => ({ title: "", customer_name: "", customer_contact: "", source: "Social media", social_platform: "Facebook", custom_source: "", quantity: "1", order_date: displayDate(isoDate()), target_date: "", total_price: "", amount_paid: "", payment_channel: "", payment_reference: "", notes: "", image_uri: "", fulfilment_method:"collection", is_past_order:false, past_order_progress:"in_progress" });
const statusLabel: Record<OrderStatus,string> = { new: "Pending", making: "Active", ready: "Ready", completed: "Completed", cancelled: "Stopped" };
const statusIcon: Record<OrderStatus,keyof typeof Ionicons.glyphMap> = { new: "sparkles-outline", making: "construct-outline", ready: "checkmark-circle-outline", completed: "bag-check-outline", cancelled: "close-circle-outline" };
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

type PaymentStage = "pending_deposit" | "deposit_paid" | "pending_final" | "full";
function paymentStage(order: Pick<Order,"total_price"|"amount_paid"|"status">): PaymentStage {
  const total=Number(order.total_price),paid=Number(order.amount_paid),deposit=total*.5;
  if(total>0&&paid>=total) return "full";
  if(paid<deposit) return "pending_deposit";
  if(order.status==="ready"||order.status==="completed") return "pending_final";
  return "deposit_paid";
}
const paymentStageLabel:Record<PaymentStage,string>={pending_deposit:"Pending downpayment",deposit_paid:"Downpayment paid",pending_final:"Pending final payment",full:"Full payment"};

function dueInfo(order: Order) {
  if (!order.target_date || order.status === "completed" || order.status === "cancelled") return null;
  const due = new Date(`${order.target_date}T12:00:00`);
  const base = new Date(`${isoDate()}T12:00:00`);
  const days = Math.round((due.getTime() - base.getTime()) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: C.ruby };
  if (days === 0) return { text: "Due today", color: C.ruby };
  if (days <= 3) return { text: `${days}d left`, color: C.amber };
  return { text: `${days}d left`, color: C.green };
}

export function OrdersScreen({ businessId, locationId }: { businessId: string; locationId: string }) {
  const { width } = useWindowDimensions();
  const [orders,setOrders] = useState<Order[]>([]);
  const [sources,setSources] = useState<Source[]>([]);
  const [loading,setLoading] = useState(true);
  const [view,setView] = useState<"open" | "stopped" | "completed" | "all">("open");
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
    open: orders.filter(o=>!["completed","cancelled"].includes(o.status)).length,
    stopped: orders.filter(o=>o.status==="cancelled").length,
  }),[orders]);
  const filtered = orders.filter(o => {
    const statusOk = view === "all" || (view === "open" ? !["completed","cancelled"].includes(o.status) : view === "stopped" ? o.status === "cancelled" : o.status === "completed");
    const sourceOk = sourceFilter === "All" || sourceGroup(o.source) === sourceFilter;
    const q=search.trim().toLowerCase();
    return statusOk && sourceOk && (!q || `${o.title} ${o.customer_name ?? ""} ${o.customer_contact ?? ""} ${o.order_number}`.toLowerCase().includes(q));
  });
  const urgent = orders.filter(o=>{ const d=dueInfo(o); return d && d.color!==C.green; }).length;
  const missingPrices = orders.filter(o=>Number(o.total_price)<=0).length;
  const paymentSummary = useMemo(() => {
    const paid = orders.reduce((sum,o)=>sum+Number(o.amount_paid),0);
    const outstanding = orders.filter(o=>o.status!=="cancelled").reduce((sum,o)=>sum+Math.max(0,Number(o.total_price)-Number(o.amount_paid)),0);
    return { paid, outstanding };
  },[orders]);

  const startNew = () => { setForm(emptyForm()); setEditing("new"); };
  const startEdit = (o: Order) => {
    const isSocial = SOCIAL_PLATFORMS.includes(o.source);
    setForm({ title:o.title,customer_name:o.customer_name??"",customer_contact:o.customer_contact??"",source:isSocial?"Social media":ORDER_SOURCES.includes(o.source)?o.source:"Other",social_platform:isSocial?o.source:"Facebook",custom_source:!isSocial&&!ORDER_SOURCES.includes(o.source)?o.source:"",quantity:String(o.quantity),order_date:displayDate(o.order_date),target_date:displayDate(o.target_date),total_price:String(o.total_price),amount_paid:String(o.amount_paid),payment_channel:o.payment_channel??"",payment_reference:o.payment_reference??"",notes:o.notes??"",image_uri:o.image_url??"",fulfilment_method:o.fulfilment_method??"collection",is_past_order:o.is_past_order??false,past_order_progress:o.status==="completed"?"completed":"in_progress" });
    setEditing(o);
  };
  const duplicate = (o: Order) => { startEdit(o); setForm(f=>({...f,title:`${o.title} copy`,order_date:displayDate(isoDate()),target_date:"",amount_paid:"",payment_channel:"",payment_reference:"",is_past_order:false,past_order_progress:"in_progress"})); setEditing("new"); };
  const choosePhoto = async () => {
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted) return Alert.alert("Photo access needed","Allow Mik to choose an order photo.");
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:1});
    if(!result.canceled) setForm(f=>({...f,image_uri:result.assets[0].uri}));
  };
  const save = async () => {
    const quantity=Number(form.quantity), total=Number(form.total_price), paid=Number(form.amount_paid || 0);
    const orderDate=inputDate(form.order_date),targetDate=form.target_date.trim()?inputDate(form.target_date):null;
    const source=form.source==="Social media"
      ? (form.social_platform==="Other" ? form.custom_source.trim() || "Other social media" : form.social_platform)
      : form.source==="Other" ? form.custom_source.trim() || "Other" : form.source;
    if(!form.title.trim()) return Alert.alert("Order name needed","Enter what the customer ordered.");
    if(!orderDate) return Alert.alert("Order date needed","Enter the date as DD-MM-YYYY, for example 01-09-2026.");
    if(form.is_past_order&&orderDate>isoDate()) return Alert.alert("Check the past order date","A past order must use today or an earlier date.");
    if(!Number.isInteger(quantity)||quantity<1) return Alert.alert("Check quantity","Quantity must be at least 1.");
    if(!Number.isFinite(total)||total<=0||!Number.isFinite(paid)||paid<0||paid>total) return Alert.alert("Check payment","Enter a total price above zero. Paid amount cannot be greater than the total price.");
    const pastCompleted=form.is_past_order&&form.past_order_progress==="completed";
    if(pastCompleted&&paid<total) return Alert.alert("Full payment needed","An already completed order must include the full amount received. Choose Still in progress if work or payment remains.");
    if(form.target_date.trim() && (!targetDate || targetDate<orderDate)) return Alert.alert("Check expected date","Use DD-MM-YYYY and choose a date on or after the order date, or leave it empty.");
    if(paid>0&&!form.payment_channel.trim()) return Alert.alert("Payment method needed","Choose where or how the customer paid.");
    setSaving(true);
    const payment_status:PaymentStatus=paid<=0?"unpaid":paid>=total?"paid":"partial";
    const payload={business_id:businessId,location_id:locationId,title:form.title.trim(),customer_name:form.customer_name.trim()||null,customer_contact:form.customer_contact.trim()||null,source,quantity,order_date:orderDate,target_date:pastCompleted?null:targetDate,total_price:total,amount_paid:paid,payment_status,payment_channel:paid>0?form.payment_channel.trim()||null:null,payment_reference:paid>0?form.payment_reference.trim()||null:null,notes:form.notes.trim()||null,fulfilment_method:form.fulfilment_method,is_past_order:form.is_past_order,...(form.is_past_order?{status:(pastCompleted?"completed":"new") as OrderStatus,fulfilled_at:pastCompleted?`${orderDate}T12:00:00+08:00`:null}:{})};
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
    if(id && !pastCompleted && paid>=total*.5) {
      const {data:existing}=await supabase.from("print_jobs").select("id").eq("external_order_id",id).maybeSingle();
      if(!existing) {
        const {data:{user}}=await supabase.auth.getUser();
        await supabase.from("print_jobs").insert({business_id:businessId,location_id:locationId,external_order_id:id,title:form.title.trim(),quantity,needed_date:targetDate,status:"to_print",created_by:user!.id});
      }
    }
    if((form.source==="Other"||form.social_platform==="Other")&&!source.startsWith("Other")) await supabase.from("order_sources").upsert({business_id:businessId,name:source},{onConflict:"business_id,name"});
    setSaving(false); setEditing(null); await load();
    Alert.alert("Order saved",pastCompleted?"The past order and full payment are recorded in Completed orders.":form.is_past_order?"The past order is active and will follow the normal order flow.":paid>=total?"Full payment is recorded.":paid>=total*.5?"The downpayment is recorded. The order is pending for printing.":`Waiting for downpayment. Printing cannot start until at least ${peso(total*.5)} is paid.`);
  };
  const setStatus = async (o:Order,status:OrderStatus) => {
    if(Number(o.total_price)<=0)
      return Alert.alert("Price needed","Open this order and enter its full price before changing its status.");
    if(status==="making" && Number(o.amount_paid)<Number(o.total_price)*.5)
      return Alert.alert("50% downpayment needed",`Record at least ${peso(Number(o.total_price)*.5)} before printing.`);
    if(status==="completed" && Number(o.amount_paid)<Number(o.total_price))
      return Alert.alert("Final payment needed",`Record the remaining ${peso(Number(o.total_price)-Number(o.amount_paid))} before completing this order.`);
    const action=async(extra:Record<string,unknown>={})=>{const {error}=await supabase.from("external_orders").update({status,...extra}).eq("id",o.id);if(error)return Alert.alert("Order not updated",error.message);const queueStatus=status==="making"?"printing":status==="ready"?"ready":status==="completed"?"done":null;if(queueStatus)await supabase.from("print_jobs").update({status:queueStatus}).eq("external_order_id",o.id);await load();};
    if(status==="cancelled") return Alert.alert("Stop this order?","Printing will stop. The order will remain in history.",[{text:"Keep active",style:"cancel"},{text:"Stop order",style:"destructive",onPress:()=>void action()}]);
    if(status==="completed") return Alert.alert(o.fulfilment_method==="delivery"?"Confirm delivery":"Confirm collection",`Final payment is fully recorded. Mark this order as ${o.fulfilment_method==="delivery"?"delivered":"collected"}?`,[{text:"Not yet",style:"cancel"},{text:o.fulfilment_method==="delivery"?"Yes, delivered":"Yes, collected",onPress:()=>void action({fulfilled_at:new Date().toISOString()})}]);
    await action();
  };
  const exportOrders = async () => {
    const rows=[["Order","Name","Customer","Contact","Source","Order type","Order date","Expected date","Status","Quantity","Total price","Amount paid","Balance","Payment status","Paid via","Reference","Notes"],...orders.map(o=>[`ORD-${o.order_number}`,o.title,o.customer_name??"",o.customer_contact??"",o.source,o.is_past_order?"Past order":"Current order",displayDate(o.order_date),displayDate(o.target_date),statusLabel[o.status],o.quantity,o.total_price,o.amount_paid,Number(o.total_price)-Number(o.amount_paid),paymentStageLabel[paymentStage(o)],o.payment_channel??"",o.payment_reference??"",o.notes??""])];
    const csv="\uFEFF"+rows.map(r=>r.map(csvCell).join(",")).join("\n"); const filename=`mik-orders-${displayDate(isoDate())}.csv`;
    if(Platform.OS==="web"){const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);return;}
    const file=new File(Paths.cache,filename);file.create();file.write(csv);await Sharing.shareAsync(file.uri);
  };

  if(editing) return <OrderForm form={form} setForm={setForm} saving={saving} editing={editing!=="new"} onBack={()=>setEditing(null)} onSave={save} onPhoto={choosePhoto}/>;
  return <ScrollView contentContainerStyle={s.page}>
    <View style={[s.headingRow,width<520&&s.headingRowMobile]}><View style={s.headingCopy}><Text style={s.title}>Orders</Text><Text style={s.subtitle}>Customer orders received outside Mik</Text></View><Pressable style={[s.add,width<520&&s.addMobile]} onPress={startNew}><Ionicons name="add" size={25} color={C.white}/><Text style={s.addText}>New order</Text></Pressable></View>
    <View style={s.hero}><Text style={s.heroKicker}>ORDER TRACKER</Text><Text style={s.heroValue}>{counts.open} open</Text><Text style={s.heroHelp}>{urgent?`${urgent} need attention today`:"Orders are up to date"}</Text></View>
    {missingPrices>0?<Pressable style={s.priceWarning} onPress={()=>setView("all")}><Ionicons name="alert-circle" size={22} color={C.ruby}/><View style={{flex:1}}><Text style={s.priceWarningTitle}>{missingPrices} order{missingPrices===1?" needs":"s need"} a price</Text><Text style={s.priceWarningText}>Open each order and enter the full customer price. A ₱0 order cannot continue.</Text></View></Pressable>:null}
    <View style={s.summaryRow}><View style={s.summaryItem}><Text style={s.factLabel}>PAID</Text><Text style={s.summaryValue}>{peso(paymentSummary.paid)}</Text></View><View style={s.summaryItem}><Text style={s.factLabel}>BALANCE TO COLLECT</Text><Text style={s.summaryValue}>{peso(paymentSummary.outstanding)}</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
      {([['open',`Open ${counts.open}`],['stopped',`Stopped ${counts.stopped}`],['completed','Completed'],['all','All']] as const).map(([id,label])=><Pressable accessibilityRole="button" key={id} style={[s.tab,view===id&&s.tabOn]} onPress={()=>setView(id)}><Text pointerEvents="none" style={[s.tabText,view===id&&s.tabTextOn]}>{label}</Text></Pressable>)}
    </ScrollView>
    <View style={s.search}><Ionicons name="search" size={20} color={C.muted}/><TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search order or customer"/></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sourceRow}>{["All",...ORDER_SOURCES].map(x=><Pressable key={x} style={[s.sourceChip,sourceFilter===x&&s.sourceChipOn]} onPress={()=>setSourceFilter(x)}><Text style={[s.sourceText,sourceFilter===x&&s.sourceTextOn]}>{x}</Text></Pressable>)}</ScrollView>
    {loading?<ActivityIndicator size="large" color={C.navy}/>:filtered.length?filtered.map(o=><OrderCard key={o.id} order={o} onEdit={()=>startEdit(o)} onDuplicate={()=>duplicate(o)} onStatus={(st)=>void setStatus(o,st)}/>):<View style={s.empty}><Ionicons name="file-tray-outline" size={34} color={C.navy}/><Text style={s.emptyTitle}>No orders here</Text><Text style={s.emptyHelp}>Tap New order for social media, walk-in, referral, marketplace or website orders.</Text></View>}
    <Pressable style={s.export} onPress={()=>void exportOrders()}><Ionicons name="download-outline" size={22} color={C.navy}/><Text style={s.exportText}>Export all orders for Excel</Text></Pressable>
  </ScrollView>;
}

function OrderCard({order,onEdit,onDuplicate,onStatus}:{order:Order;onEdit:()=>void;onDuplicate:()=>void;onStatus:(s:OrderStatus)=>void}) {
  const priceMissing=Number(order.total_price)<=0;
  const due=dueInfo(order); const balance=Number(order.total_price)-Number(order.amount_paid);
  const depositNeeded=Number(order.total_price)*.5;
  const depositPaid=Number(order.amount_paid)>=depositNeeded;
  const stage=paymentStage(order);
  const displayStatus=order.status==="cancelled"?"Stopped":order.status==="completed"?(order.fulfilment_method==="delivery"?"Delivered":"Collected"):order.status==="ready"?"Ready":order.status==="making"?"Printing":depositPaid?"To print":"Waiting for downpayment";
  const stageColor=stage==="full"?C.green:stage==="pending_deposit"?C.ruby:C.amber;
  const stageSoft=stage==="full"?"#ECF5F0":stage==="pending_deposit"?"#FBEFF1":"#F8F2E8";
  const paymentMessage=stage==="pending_deposit"?`${peso(Math.max(0,depositNeeded-Number(order.amount_paid)))} more needed before printing`:stage==="deposit_paid"?`Downpayment received · ${peso(balance)} balance`:stage==="pending_final"?`Final payment due: ${peso(balance)}`:"Full payment received";
  const next:OrderStatus|null=order.status==="new"?"making":order.status==="making"?"ready":order.status==="ready"?"completed":null;
  return <View style={s.card}>
    <View style={s.cardTop}>{order.image_url?<Image source={{uri:order.image_url}} style={s.photo}/>:<View style={s.noPhoto}><Ionicons name="cube-outline" size={28} color={C.navy}/></View>}<View style={s.cardMain}><View style={s.numberRow}><Text style={s.number}>ORD-{order.order_number}</Text><View style={[s.status,!depositPaid&&!["cancelled","completed"].includes(order.status)&&s.statusHold]}><Ionicons name={statusIcon[order.status]} size={14} color={order.status==="cancelled"?C.ruby:C.navy}/><Text style={[s.statusText,order.status==="cancelled"&&{color:C.ruby}]}>{displayStatus}</Text></View></View><Text style={s.cardTitle} numberOfLines={2}>{order.title}</Text><Text style={s.meta}>{order.customer_name||"No customer name"} · {order.source}</Text>{order.is_past_order?<View style={s.pastOrderTag}><Ionicons name="archive-outline" size={14} color={C.amber}/><Text style={s.pastOrderTagText}>PAST ORDER</Text></View>:null}</View></View>
    {priceMissing?<Pressable style={s.priceNeededTag} onPress={onEdit}><Ionicons name="alert-circle" size={17} color={C.ruby}/><Text style={s.priceNeededText}>Price needed · Tap to fix</Text></Pressable>:<View style={[s.paymentTag,{backgroundColor:stageSoft}]}><Ionicons name={stage==="full"?"checkmark-circle":"card-outline"} size={16} color={stageColor}/><Text style={[s.paymentTagText,{color:stageColor}]}>{paymentStageLabel[stage]}</Text></View>}
    <View style={s.facts}><View><Text style={s.factLabel}>{order.is_past_order?"ORDER DATE":"EXPECTED"}</Text><Text style={[s.factValue,due&&{color:due.color}]}>{order.is_past_order?displayDate(order.order_date):due?.text||displayDate(order.target_date)||"No date"}</Text></View><View><Text style={s.factLabel}>PRICE</Text><Text style={s.factValue}>{peso(Number(order.total_price))}</Text></View><View><Text style={s.factLabel}>PAYMENT</Text><Text style={[s.factValue,{color:stageColor}]}>{paymentStageLabel[stage]}</Text></View></View>
    <Text style={[s.depositLine,{color:stageColor}]}>{paymentMessage}</Text>
    {order.amount_paid>0?<Text style={s.paymentDetail}>{peso(Number(order.amount_paid))} paid via {order.payment_channel}{balance>0?` · ${peso(balance)} remaining`:""}</Text>:null}
    {order.notes?<View style={s.remarks}><Text style={s.factLabel}>REMARKS</Text><Text style={s.remarksText}>{order.notes}</Text></View>:null}
    {next?<Pressable style={[s.next,(priceMissing||(!depositPaid&&next==="making")||(next==="completed"&&stage!=="full"))&&s.nextDisabled]} onPress={()=>priceMissing?onEdit():onStatus(next)}><Text style={s.nextText}>{priceMissing?"Enter the full price first":next==="making"?(depositPaid?"Start printing":"Record 50% downpayment first"):next==="ready"?"Mark as ready":stage==="full"?(order.fulfilment_method==="delivery"?"Confirm delivered":"Confirm collected"):"Record final payment first"}</Text><Ionicons name={priceMissing||(next==="making"&&!depositPaid)||(next==="completed"&&stage!=="full")?"lock-closed":"arrow-forward"} size={20} color={C.white}/></Pressable>:null}
    <View style={s.cardActions}><Pressable style={s.link} onPress={onEdit}><Ionicons name="create-outline" size={18} color={C.navy}/><Text style={s.linkText}>View / edit</Text></Pressable><Pressable style={s.link} onPress={onDuplicate}><Ionicons name="copy-outline" size={18} color={C.navy}/><Text style={s.linkText}>Duplicate</Text></Pressable>{!["completed","cancelled"].includes(order.status)?<Pressable style={s.link} onPress={()=>onStatus("cancelled")}><Text style={s.cancelText}>Stop</Text></Pressable>:order.status==="cancelled"?<Pressable style={s.link} onPress={()=>onStatus("new")}><Text style={s.linkText}>Resume</Text></Pressable>:null}</View>
  </View>;
}

function OrderForm({form,setForm,saving,editing,onBack,onSave,onPhoto}:{form:Form;setForm:Dispatch<SetStateAction<Form>>;saving:boolean;editing:boolean;onBack:()=>void;onSave:()=>void;onPhoto:()=>void}) {
  const { width } = useWindowDimensions();
  const narrow = width < 620;
  const update=(key:keyof Form,value:string)=>setForm(f=>({...f,[key]:value})); const total=Number(form.total_price||0),paid=Number(form.amount_paid||0);
  return <ScrollView contentContainerStyle={s.page}>
    <Pressable style={s.back} onPress={onBack}><Ionicons name="arrow-back" size={23} color={C.ink}/><Text style={s.backText}>{editing?"Edit order":"New order"}</Text></Pressable>
    <Text style={s.formLead}>{editing?"Update the project details.":"What did the customer order?"}</Text>
    <View style={s.requiredNote}><Ionicons name="information-circle-outline" size={21} color={C.navy}/><Text style={s.requiredNoteText}><Text style={s.requiredStrong}>Required:</Text> order name, source, quantity, order date and total price. <Text style={s.requiredStrong}>Optional:</Text> customer details, photo, expected date, payment reference and remarks.</Text></View>
    <FormSection number="1" title="What is the order?" help="Give it a name the team will recognise. Add a photo when the design is customised."/>
    <Pressable style={s.photoPicker} onPress={onPhoto}>{form.image_uri?<Image source={{uri:form.image_uri}} style={s.formPhoto}/>:<><View style={s.photoCircle}><Ionicons name="camera-outline" size={28} color={C.white}/></View><Text style={s.photoTitle}>Add project photo</Text><Text style={s.photoHelp}>Optional, but useful for customised work</Text></>}</Pressable>
    <Field label="Order name · Required" value={form.title} onChangeText={v=>update("title",v)} placeholder="Example: Customised Gecko"/>
    <FormSection number="2" title="Who ordered it?" help="Use a name or social-media username so the team can find the customer later."/>
    <View style={[s.two,narrow&&s.twoStack]}><View style={[s.half,narrow&&s.halfStack]}><Field label="Customer name · Optional" value={form.customer_name} onChangeText={v=>update("customer_name",v)} placeholder="Customer name"/></View><View style={[s.half,narrow&&s.halfStack]}><Field label="Contact · Optional" value={form.customer_contact} onChangeText={v=>update("customer_contact",v)} placeholder="Phone or username"/></View></View>
    <Text style={s.label}>Order source · Required</Text><View style={s.wrap}>{ORDER_SOURCES.map(x=><Pressable key={x} style={[s.choice,form.source===x&&s.choiceOn]} onPress={()=>update("source",x)}><Text style={[s.choiceText,form.source===x&&s.choiceTextOn]}>{x}</Text></Pressable>)}</View>
    {form.source==="Social media"?<><Text style={s.label}>Which social media?</Text><View style={s.wrap}>{SOCIAL_PLATFORMS.map(x=><Pressable key={x} style={[s.choice,form.social_platform===x&&s.choiceOn]} onPress={()=>update("social_platform",x)}><Text style={[s.choiceText,form.social_platform===x&&s.choiceTextOn]}>{x}</Text></Pressable>)}</View></>:null}
    {form.source==="Other"||form.source==="Social media"&&form.social_platform==="Other"?<Field label="Source name" value={form.custom_source} onChangeText={v=>update("custom_source",v)} placeholder="Type where the order came from"/>:null}
    <FormSection number="3" title="How much and when?" help="Enter the full order price. The expected date can stay empty when it is not confirmed."/>
    <Text style={s.label}>When are you entering this order?</Text><View style={s.orderTimeChoices}><Pressable style={[s.orderTimeChoice,!form.is_past_order&&s.orderTimeChoiceOn]} onPress={()=>setForm(f=>({...f,is_past_order:false,past_order_progress:"in_progress"}))}><Ionicons name="sparkles-outline" size={22} color={!form.is_past_order?C.white:C.navy}/><View style={{flex:1}}><Text style={[s.orderTimeTitle,!form.is_past_order&&s.orderTimeTextOn]}>New or current order</Text><Text style={[s.orderTimeHelp,!form.is_past_order&&s.orderTimeHelpOn]}>An order received now</Text></View></Pressable><Pressable style={[s.orderTimeChoice,form.is_past_order&&s.orderTimeChoiceOn]} onPress={()=>setForm(f=>({...f,is_past_order:true}))}><Ionicons name="archive-outline" size={22} color={form.is_past_order?C.white:C.navy}/><View style={{flex:1}}><Text style={[s.orderTimeTitle,form.is_past_order&&s.orderTimeTextOn]}>Past order</Text><Text style={[s.orderTimeHelp,form.is_past_order&&s.orderTimeHelpOn]}>An older order entered later</Text></View></Pressable></View>
    {form.is_past_order?<><Text style={s.label}>Is this past order finished?</Text><View style={s.orderTimeChoices}><Pressable style={[s.orderTimeChoice,form.past_order_progress==="in_progress"&&s.orderTimeChoiceOn]} onPress={()=>setForm(f=>({...f,past_order_progress:"in_progress"}))}><Ionicons name="construct-outline" size={22} color={form.past_order_progress==="in_progress"?C.white:C.navy}/><View style={{flex:1}}><Text style={[s.orderTimeTitle,form.past_order_progress==="in_progress"&&s.orderTimeTextOn]}>Still in progress</Text><Text style={[s.orderTimeHelp,form.past_order_progress==="in_progress"&&s.orderTimeHelpOn]}>Continue with payment, printing and collection</Text></View></Pressable><Pressable style={[s.orderTimeChoice,form.past_order_progress==="completed"&&s.orderTimeChoiceOn]} onPress={()=>setForm(f=>({...f,past_order_progress:"completed",target_date:""}))}><Ionicons name="checkmark-circle-outline" size={22} color={form.past_order_progress==="completed"?C.white:C.navy}/><View style={{flex:1}}><Text style={[s.orderTimeTitle,form.past_order_progress==="completed"&&s.orderTimeTextOn]}>Already completed</Text><Text style={[s.orderTimeHelp,form.past_order_progress==="completed"&&s.orderTimeHelpOn]}>Save it directly in Completed orders</Text></View></Pressable></View></>:null}
    <View style={[s.two,narrow&&s.twoStack]}><View style={[s.half,narrow&&s.halfStack]}><Field label="Quantity · Required" value={form.quantity} onChangeText={v=>update("quantity",v)} keyboardType="number-pad"/></View><View style={[s.half,narrow&&s.halfStack]}><Field label="Total price · Required" value={form.total_price} onChangeText={v=>update("total_price",v)} keyboardType="decimal-pad" placeholder="₱0"/></View></View>
    <View style={[s.two,narrow&&s.twoStack]}><View style={[s.half,narrow&&s.halfStack]}><Field label={form.is_past_order?"Date of past order · Required":"Order date · Required"} value={form.order_date} onChangeText={v=>update("order_date",v)} placeholder="DD-MM-YYYY" maxLength={10}/></View>{(!form.is_past_order||form.past_order_progress==="in_progress")?<View style={[s.half,narrow&&s.halfStack]}><Field label="Expected date · Optional" value={form.target_date} onChangeText={v=>update("target_date",v)} placeholder="DD-MM-YYYY" maxLength={10}/></View>:null}</View>
    <Text style={s.label}>How will the customer receive it?</Text><View style={s.wrap}>{([['collection','Customer collects'],['delivery','Deliver to customer']] as const).map(([id,label])=><Pressable key={id} style={[s.choice,form.fulfilment_method===id&&s.choiceOn]} onPress={()=>setForm(f=>({...f,fulfilment_method:id}))}><Text style={[s.choiceText,form.fulfilment_method===id&&s.choiceTextOn]}>{label}</Text></Pressable>)}</View>
    <FormSection number="4" title="What has the customer paid?" help="Printing starts after the 50% downpayment. Mik will show the remaining balance."/>
    <View style={s.paymentBox}><View style={s.paymentHead}><Ionicons name="card-outline" size={25} color={C.navy}/><View><Text style={s.paymentTitle}>Customer payment</Text><Text style={s.photoHelp}>No downpayment means no printing.</Text></View></View><Text style={s.label}>Quick payment</Text><View style={s.wrap}><Pressable style={[s.choice,paid===0&&s.choiceOn]} onPress={()=>setForm(f=>({...f,amount_paid:"0",payment_channel:"",payment_reference:""}))}><Text style={[s.choiceText,paid===0&&s.choiceTextOn]}>No downpayment</Text></Pressable><Pressable style={[s.choice,total>0&&paid===total*.5&&s.choiceOn]} onPress={()=>update("amount_paid",String(total*.5))}><Text style={[s.choiceText,total>0&&paid===total*.5&&s.choiceTextOn]}>Paid 50%</Text></Pressable><Pressable style={[s.choice,total>0&&paid===total&&s.choiceOn]} onPress={()=>update("amount_paid",String(total))}><Text style={[s.choiceText,total>0&&paid===total&&s.choiceTextOn]}>Full payment</Text></Pressable></View><Field label="Amount paid" value={form.amount_paid} onChangeText={v=>update("amount_paid",v)} keyboardType="decimal-pad" placeholder="₱0"/><View style={s.paymentNumbers}><Text style={s.balance}>50% needed: {peso(total*.5)}</Text></View><Text style={s.balanceSmall}>Final balance: {peso(Math.max(0,total-paid))}</Text><Text style={s.label}>Payment method</Text><View style={s.wrap}>{["Cash","GCash","Bank transfer","Facebook / online","Other"].map(x=><Pressable key={x} style={[s.choice,form.payment_channel===x&&s.choiceOn]} onPress={()=>update("payment_channel",x)}><Text style={[s.choiceText,form.payment_channel===x&&s.choiceTextOn]}>{x}</Text></Pressable>)}</View><Field label="Payment reference" value={form.payment_reference} onChangeText={v=>update("payment_reference",v)} placeholder="Optional receipt or reference"/></View>
    <FormSection number="5" title="Anything else?" help="Add only information the person making or handing over the order needs to know."/>
    <Field label="Remarks · Optional" value={form.notes} onChangeText={v=>update("notes",v)} placeholder="Colour, size, design, delivery or anything important" multiline/>
    <Pressable style={[s.save,saving&&{opacity:.6}]} onPress={onSave} disabled={saving}><Ionicons name="checkmark" size={22} color={C.white}/><Text style={s.saveText}>{saving?"Saving…":editing?"Save changes":"Save order"}</Text></Pressable>
  </ScrollView>;
}

function FormSection({number,title,help}:{number:string;title:string;help:string}) { return <View style={s.formSection}><View style={s.formSectionNumber}><Text style={s.formSectionNumberText}>{number}</Text></View><View style={{flex:1}}><Text style={s.formSectionTitle}>{title}</Text><Text style={s.formSectionHelp}>{help}</Text></View></View>; }

function Field(props:TextInputProps&{label:string}) { return <View><Text style={s.label}>{props.label}</Text><TextInput {...props} style={[s.input,props.multiline&&s.notes]} placeholderTextColor="#8A9199"/></View>; }

const s=StyleSheet.create({
  page:{paddingTop:18,paddingBottom:40},headingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},headingRowMobile:{flexDirection:"column",alignItems:"stretch"},headingCopy:{flex:1},title:{fontSize:28,lineHeight:34,fontWeight:"700",color:C.ink,letterSpacing:-.6},subtitle:{marginTop:3,fontSize:15,lineHeight:22,color:C.muted},add:{minHeight:48,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderRadius:12,backgroundColor:C.navy},addMobile:{width:"100%"},addText:{color:C.white,fontSize:14,fontWeight:"700"},
  hero:{marginTop:18,padding:22,borderWidth:1,borderColor:"#DCE5EB",borderRadius:14,backgroundColor:"#EEF3F7"},heroKicker:{color:C.navy,fontSize:11,fontWeight:"700",letterSpacing:1.6},heroValue:{marginTop:6,color:C.ink,fontSize:34,fontWeight:"700"},heroHelp:{marginTop:5,color:C.muted,fontSize:14,fontWeight:"600"},tabs:{gap:8,paddingVertical:14},tab:{minHeight:44,paddingHorizontal:15,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},tabOn:{backgroundColor:C.ink,borderColor:C.ink},tabText:{color:C.ink,fontSize:13,fontWeight:"700"},tabTextOn:{color:C.white},
  priceWarning:{marginTop:12,padding:15,flexDirection:"row",alignItems:"flex-start",gap:10,borderWidth:1,borderColor:"#E8C9D2",borderRadius:14,backgroundColor:"#FCF4F6"},priceWarningTitle:{color:C.ruby,fontSize:15,fontWeight:"700"},priceWarningText:{marginTop:3,color:C.ink,fontSize:14,lineHeight:20},
  summaryRow:{marginTop:10,flexDirection:"row",gap:7},summaryItem:{minWidth:0,flex:1,padding:11,borderRadius:10,backgroundColor:C.pale},summaryValue:{marginTop:5,color:C.ink,fontSize:13,fontWeight:"700"},
  search:{minHeight:52,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:9,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},searchInput:{flex:1,minHeight:50,color:C.ink,fontSize:16},sourceRow:{gap:7,paddingVertical:10},sourceChip:{minHeight:36,paddingHorizontal:12,alignItems:"center",justifyContent:"center",borderRadius:18,backgroundColor:C.pale},sourceChipOn:{backgroundColor:C.green},sourceText:{color:C.ink,fontSize:12,fontWeight:"700"},sourceTextOn:{color:C.white},
  card:{marginTop:12,padding:16,borderWidth:1,borderColor:C.border,borderRadius:16,backgroundColor:C.white},cardTop:{flexDirection:"row",gap:12},photo:{width:78,height:78,borderRadius:12,resizeMode:"contain",backgroundColor:C.pale},noPhoto:{width:78,height:78,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:C.pale},cardMain:{flex:1},numberRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6},number:{color:C.muted,fontSize:11,fontWeight:"700",letterSpacing:.7},status:{paddingHorizontal:9,paddingVertical:6,flexDirection:"row",alignItems:"center",gap:4,borderRadius:12,backgroundColor:C.pale},statusHold:{backgroundColor:"#FBEFF1"},statusText:{color:C.navy,fontSize:11,fontWeight:"700"},cardTitle:{marginTop:7,color:C.ink,fontSize:19,lineHeight:24,fontWeight:"700"},meta:{marginTop:5,color:C.muted,fontSize:14,fontWeight:"500"},pastOrderTag:{alignSelf:"flex-start",marginTop:7,paddingHorizontal:8,paddingVertical:4,flexDirection:"row",alignItems:"center",gap:4,borderRadius:10,backgroundColor:"#F8F2E8"},pastOrderTagText:{color:C.amber,fontSize:10,fontWeight:"800",letterSpacing:.6},paymentTag:{alignSelf:"flex-start",minHeight:32,marginTop:11,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:6,borderRadius:15},paymentTagText:{fontSize:13,fontWeight:"700"},priceNeededTag:{alignSelf:"stretch",minHeight:42,marginTop:11,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:7,borderWidth:1,borderColor:"#E8C9D2",borderRadius:12,backgroundColor:"#FCF4F6"},priceNeededText:{color:C.ruby,fontSize:14,fontWeight:"700"},facts:{marginTop:12,paddingTop:12,flexDirection:"row",justifyContent:"space-between",borderTopWidth:1,borderTopColor:C.border},factLabel:{color:C.muted,fontSize:11,fontWeight:"700",letterSpacing:.8},factValue:{marginTop:4,color:C.ink,fontSize:14,fontWeight:"700"},depositLine:{marginTop:11,fontSize:14,fontWeight:"700"},paymentDetail:{marginTop:5,color:C.muted,fontSize:13,fontWeight:"600"},remarks:{marginTop:12,padding:11,borderRadius:9,backgroundColor:C.pale},remarksText:{marginTop:4,color:C.ink,fontSize:14,lineHeight:20},next:{alignSelf:"flex-start",maxWidth:"100%",minHeight:46,marginTop:13,paddingHorizontal:15,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:12,borderRadius:12,backgroundColor:C.navy},nextDisabled:{backgroundColor:C.ruby},nextText:{flexShrink:1,color:C.white,fontSize:14,lineHeight:19,fontWeight:"700"},cardActions:{minHeight:46,flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:18},link:{minHeight:40,flexDirection:"row",alignItems:"center",gap:5},linkText:{color:C.navy,fontSize:13,fontWeight:"700"},cancelText:{color:C.ruby,fontSize:13,fontWeight:"700"},
  empty:{marginTop:18,padding:28,alignItems:"center",borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.pale},emptyTitle:{marginTop:10,color:C.ink,fontSize:19,fontWeight:"700"},emptyHelp:{marginTop:5,color:C.muted,fontSize:14,lineHeight:20,textAlign:"center"},export:{minHeight:54,marginTop:18,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,borderWidth:1,borderColor:C.navy,borderRadius:10,backgroundColor:C.white},exportText:{color:C.navy,fontSize:14,fontWeight:"700"},
  back:{minHeight:48,flexDirection:"row",alignItems:"center",gap:9},backText:{color:C.ink,fontSize:17,fontWeight:"700"},formLead:{marginTop:10,color:C.ink,fontSize:28,lineHeight:34,fontWeight:"700",letterSpacing:-.7},requiredNote:{marginTop:14,padding:13,flexDirection:"row",alignItems:"flex-start",gap:9,borderWidth:1,borderColor:"#D6E1EB",borderRadius:12,backgroundColor:"#EEF3F8"},requiredNoteText:{flex:1,color:C.muted,fontSize:13,lineHeight:19},requiredStrong:{color:C.ink,fontWeight:"700"},photoPicker:{minHeight:170,marginTop:18,alignItems:"center",justifyContent:"center",overflow:"hidden",borderWidth:1,borderStyle:"dashed",borderColor:C.border,borderRadius:12,backgroundColor:C.pale},formPhoto:{width:"100%",height:230,resizeMode:"contain"},photoCircle:{width:52,height:52,alignItems:"center",justifyContent:"center",borderRadius:26,backgroundColor:C.navy},photoTitle:{marginTop:10,color:C.ink,fontSize:16,fontWeight:"700"},photoHelp:{marginTop:3,color:C.muted,fontSize:12,lineHeight:17},label:{marginTop:15,marginBottom:6,color:C.ink,fontSize:13,fontWeight:"700"},input:{minHeight:54,paddingHorizontal:14,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white,color:C.ink,fontSize:16},notes:{minHeight:110,paddingTop:14,textAlignVertical:"top"},two:{flexDirection:"row",gap:10},twoStack:{flexDirection:"column",gap:0},half:{flex:1},halfStack:{flexGrow:0,flexBasis:"auto",width:"100%"},wrap:{flexDirection:"row",flexWrap:"wrap",gap:7},choice:{minHeight:42,paddingHorizontal:13,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:9,backgroundColor:C.white},choiceOn:{borderColor:C.navy,backgroundColor:C.navy},choiceText:{color:C.ink,fontSize:12,fontWeight:"700"},choiceTextOn:{color:C.white},paymentBox:{marginTop:18,padding:15,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.pale},paymentHead:{flexDirection:"row",alignItems:"center",gap:10},paymentTitle:{color:C.ink,fontSize:18,fontWeight:"700"},paymentNumbers:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},balance:{marginTop:8,color:C.green,fontSize:19,fontWeight:"700"},balanceSmall:{marginTop:5,color:C.muted,fontSize:13,fontWeight:"700"},save:{minHeight:58,marginTop:22,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,borderRadius:10,backgroundColor:C.navy},saveText:{color:C.white,fontSize:16,fontWeight:"700"},
  formSection:{marginTop:24,paddingTop:18,flexDirection:"row",alignItems:"flex-start",gap:11,borderTopWidth:1,borderTopColor:C.border},formSectionNumber:{width:31,height:31,alignItems:"center",justifyContent:"center",borderRadius:16,backgroundColor:C.navy},formSectionNumberText:{color:C.white,fontSize:13,fontWeight:"800"},formSectionTitle:{color:C.ink,fontSize:18,lineHeight:23,fontWeight:"700"},formSectionHelp:{marginTop:3,color:C.muted,fontSize:13,lineHeight:19},
  orderTimeChoices:{marginTop:8,gap:8},orderTimeChoice:{minHeight:64,padding:12,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.white},orderTimeChoiceOn:{borderColor:C.navy,backgroundColor:C.navy},orderTimeTitle:{color:C.ink,fontSize:14,fontWeight:"700"},orderTimeTextOn:{color:C.white},orderTimeHelp:{marginTop:2,color:C.muted,fontSize:12,lineHeight:17},orderTimeHelpOn:{color:"#DCE5EB"},
});
