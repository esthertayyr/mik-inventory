import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { userNotice } from "@/src/lib/userNotice";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";
import { ExpenseDatePicker } from "./ExpensesScreen";
import { ResellerPackageCheckout } from "./ResellerPackageCheckout";
import { ViaeSaleCard } from "./ViaeSaleCard";

type Payment = {
  id: string;
  payment_type: "deposit" | "final" | "delivery";
  amount_php: number;
  payment_method: string;
  payment_date: string;
};
type Order = {
  id: string;
  customer_name: string;
  customer_contact: string | null;
  delivery_address: string | null;
  product_name: string;
  selected_options: string | null;
  quantity: number;
  total_price_php: number;
  deposit_required_php: number;
  delivery_fee_php: number;
  delivery_fee_confirmed: boolean;
  fulfilment_status: string;
  courier: string | null;
  tracking_number: string | null;
  created_at: string;
  order_channel: string;
  order_kind: string;
  notes: string | null;
  reseller_order_stock_lines: { product_name:string; variant_name:string; pieces:number; source_product_id:string; source_product_option_id:string|null }[];
  reseller_preorder_payments: Payment[];
};
type SourceProduct = { id: string; name: string; selling_price_php:number|null; source_product_images:{image_url:string;sort_order:number}[]; source_product_options:{id:string;option_value:string;stock_units:number;selling_price_php:number|null}[] };
type CompletedSale = {id:string;product_name:string;variant_name:string;quantity:number;amount_php:number;entry_date:string;status:string;payment_method:string;payment_date:string|null;notes:string|null;source_products:{source_product_images:{image_url:string;sort_order:number}[]}|null};
type ResellerPackage = {
  id: string;
  name: string;
  package_price_php: number;
  deposit_required_php: number;
  lead_time_text: string;
  reseller_package_items: {
    quantity: number;
    choices_note: string | null;
    source_products: { name: string } | null;
  }[] | null;
};
const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
const num = (value: string) => Math.max(0, Number(value) || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const displayDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
};
const toIsoDate = (value: string) => {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};
const statusName: Record<string, string> = {
  awaiting_deposit: "Awaiting deposit",
  confirmed: "Confirmed",
  ordered: "Confirmed · Ordered",
  in_transit: "Confirmed · On the way",
  arrived: "Arrived",
  ready_to_ship: "Ready to send",
  shipped: "Shipped to customer",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const nextStep: Record<string, { label: string; next: string }> = {
  confirmed: { label: "Mark arrived", next: "arrived" },
  ordered: { label: "Mark arrived", next: "arrived" },
  in_transit: { label: "Mark arrived with us", next: "arrived" },
  ready_to_ship: { label: "Mark shipped to customer", next: "shipped" },
  shipped: { label: "Mark delivered", next: "delivered" },
};

export function ResellerPreordersScreen({
  businessId,
  locationId,
  onBack,
  onPrinting,
}: {
  businessId: string;
  locationId: string;
  onBack: () => void;
  onPrinting?: (orderId:string)=>void;
}) {
  const paymentBusy=useRef(false),paymentRequest=useRef('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [pastSales,setPastSales]=useState<CompletedSale[]>([]);
  const [stocks,setStocks]=useState<{source_product_id:string;source_product_option_id:string|null;on_hand:number;reserved:number;to_make:number}[]>([]);
  const [products, setProducts] = useState<SourceProduct[]>([]);
  const [packages, setPackages] = useState<ResellerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"active" | "completed" | "cancelled">("active");
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [variantId,setVariantId]=useState<string|null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [options, setOptions] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [total, setTotal] = useState("");
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<
    "deposit" | "final" | "delivery"
  >("deposit");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [method, setMethod] = useState("gcash");
  const [paymentDate, setPaymentDate] = useState(displayDate(today()));
  const [shippingFor, setShippingFor] = useState<string | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error },stockRows,history, { data: sourceRows }, { data: packageRows }] = await Promise.all([
      supabase
        .from("reseller_preorders")
        .select(
          "id,customer_name,customer_contact,delivery_address,product_name,selected_options,quantity,total_price_php,deposit_required_php,delivery_fee_php,delivery_fee_confirmed,fulfilment_status,courier,tracking_number,created_at,order_channel,order_kind,notes,reseller_order_stock_lines(product_name,variant_name,pieces,source_product_id,source_product_option_id),reseller_preorder_payments(id,payment_type,amount_php,payment_method,payment_date)",
        )
        .eq("business_id", businessId)
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
      supabase.from('reseller_stock_summary').select('source_product_id,source_product_option_id,on_hand,reserved,to_make').eq('business_id',businessId).eq('location_id',locationId),
      supabase.from('reseller_trade_entries').select('id,product_name,variant_name,quantity,amount_php,entry_date,status,payment_method,payment_date,notes,source_products(source_product_images(image_url,sort_order))').eq('business_id',businessId).eq('location_id',locationId).eq('kind','sale').order('entry_date',{ascending:false}).order('created_at',{ascending:false}),
      supabase
        .from("source_products")
        .select("id,name,selling_price_php,source_product_images(image_url,sort_order),source_product_options(id,option_value,stock_units,selling_price_php)")
        .eq("business_id", businessId)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("reseller_packages")
        .select("id,name,package_price_php,deposit_required_php,lead_time_text,reseller_package_items(quantity,choices_note,source_products(name))")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("created_at", { ascending: false }),
    ]);
    if (error) userNotice("Pre-orders not loaded", error.message);
    setOrders((data ?? []) as Order[]);
    if(stockRows.error)userNotice('Stock not loaded',stockRows.error.message);
    if(history.error)userNotice('Past sales not loaded',history.error.message);
    setStocks(stockRows.data??[]);setPastSales((history.data??[]).map(row=>({...row,source_products:Array.isArray(row.source_products)?row.source_products[0]??null:row.source_products})));
    setProducts((sourceRows ?? []) as SourceProduct[]);
    setPackages((packageRows ?? []) as unknown as ResellerPackage[]);
    setLoading(false);
  }, [businessId,locationId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(()=>{
    if(creating)return;
    const channel=supabase.channel(`viae-orders-${businessId}-${locationId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'reseller_preorders',filter:`business_id=eq.${businessId}`},()=>void load()).subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[businessId,locationId,load,creating]);
  useEffect(()=>{
    if(creating||paymentFor||deliveryFor||shippingFor)return;
    const timer=setInterval(()=>void load(),60000);
    return ()=>clearInterval(timer);
  },[load,creating,paymentFor,deliveryFor,shippingFor]);
  const reset = () => {
    setCustomer("");
    setContact("");
    setAddress("");
    setProductId(null);
    setVariantId(null);
    setPackageId(null);
    setProductName("");
    setOptions("");
    setQuantity("1");
    setTotal("");
    setDeposit("");
    setNotes("");
  };
  const create = async () => {
    const chosen =
      packages.find((p) => p.id === packageId)?.name ??
      products.find((p) => p.id === productId)?.name ?? productName.trim();
    if (!customer.trim()) return userNotice("Customer name needed");
    if (!chosen || (!productId&&!packageId))
      return userNotice(
        "Product needed",
        "Choose an official product or bundle.",
      );
    if (num(total) <= 0)
      return userNotice(
        "Full price needed",
        "Enter the customer's full order price.",
      );
    const depositRequired = deposit ? num(deposit) : num(total) * 0.5;
    if(productId&&products.find(p=>p.id===productId)?.source_product_options.length&&!variantId) return userNotice("Choose the exact variant","This tells MIK which pieces to reserve and deduct.");
    if(depositRequired<=0||depositRequired>num(total))return userNotice("Check deposit","Deposit must be greater than zero and no more than the full price.");
    setSaving(true);
    const { error } = await supabase.from("reseller_preorders").insert({
      business_id: businessId,
      location_id: locationId,
      source_product_id: productId,
      source_product_option_id: productId?variantId:null,
      reseller_package_id: packageId,
      package_name: packages.find((p) => p.id === packageId)?.name ?? null,
      customer_name: customer.trim(),
      customer_contact: contact.trim() || null,
      delivery_address: address.trim() || null,
      product_name: chosen,
      selected_options: options.trim() || null,
      quantity: Math.max(1, Math.floor(num(quantity) || 1)),
      total_price_php: num(total),
      deposit_required_php: depositRequired,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return userNotice("Pre-order not saved", error.message);
    reset();
    setCreating(false);
    await load();
    userNotice(
      "Pre-order saved",
      "It is pending until the customer pays the deposit.",
    );
  };
  const paid = (order: Order, type?: Payment["payment_type"]) =>
    order.reseller_preorder_payments
      .filter((p) => !type || p.payment_type === type)
      .reduce((sum, p) => sum + Number(p.amount_php), 0);
  const recordPayment = async (order: Order) => {
    if (paymentBusy.current) return;
    const amount=Number(paymentAmount),savedDate=toIsoDate(paymentDate);
    if (!Number.isFinite(amount)||amount<=0) return userNotice("Payment amount needed");
    if (!savedDate) return userNotice("Choose payment date");
    paymentBusy.current=true;setSaving(true);
    try {
      const {error}=await supabase.from("reseller_preorder_payments").insert({request_id:paymentRequest.current,preorder_id:order.id,business_id:businessId,location_id:locationId,payment_type:paymentType,amount_php:amount,payment_method:method,payment_date:savedDate});
      if(error&&error.code!=="23505")throw error;
      setPaymentFor(null);setPaymentAmount("");await load();
    }catch(e){userNotice("Payment not saved",(e as Error).message);}
    finally{paymentBusy.current=false;setSaving(false);}
  };
  const move = async (order: Order, next: string) => {
    if (next === "shipped" && !courier.trim()) return setShippingFor(order.id);
    const patch: any = {
      fulfilment_status: next,
      updated_at: new Date().toISOString(),
    };
    if (next === "ordered") patch.supplier_ordered_at = today();
    if (next === "arrived") patch.arrived_at = today();
    if (next === "shipped") {
      patch.shipped_at = today();
      patch.courier = courier.trim() || null;
      patch.tracking_number = tracking.trim() || null;
    }
    if (next === "delivered") patch.delivered_at = today();
    const { error } = await supabase
      .from("reseller_preorders")
      .update(patch)
      .eq("id", order.id);
    if (error) return userNotice("Order not updated", error.message);
    setShippingFor(null);
    setCourier("");
    setTracking("");
    await load();
  };
  const cancelOrder=(order:Order)=>{
    const message='This releases reserved stock. Payments stay in history. Handle any refund separately.';
    if(Platform.OS==='web'){if(globalThis.confirm(`Cancel order? ${message}`))void move(order,'cancelled');}
    else Alert.alert('Cancel order?',message,[{text:'Keep order',style:'cancel'},{text:'Cancel order',style:'destructive',onPress:()=>void move(order,'cancelled')}]);
  };
  const confirmDeliveryFee = async (order: Order) => {
    const fee = num(deliveryFee);
    const patch: Record<string, unknown> = {
      delivery_fee_php: fee,
      delivery_fee_confirmed: true,
      updated_at: new Date().toISOString(),
    };
    if (
      order.fulfilment_status === "arrived" &&
      paid(order) >= Number(order.total_price_php) + fee
    )
      patch.fulfilment_status = "ready_to_ship";
    const { error } = await supabase
      .from("reseller_preorders")
      .update(patch)
      .eq("id", order.id);
    if (error) return userNotice("Delivery fee not saved", error.message);
    setDeliveryFor(null);
    setDeliveryFee("");
    await load();
  };
  const shown = orders.filter((o) =>
    filter === "completed"
      ? o.fulfilment_status === "delivered"
      : filter === "cancelled" ? o.fulfilment_status === "cancelled"
      : !["delivered", "cancelled"].includes(o.fulfilment_status),
  );
  if (loading)
    return (
      <View style={s.loading}>
        <ActivityIndicator color="#594C8D" />
        <Text style={s.help}>Loading orders…</Text>
      </View>
    );
  if(creating)return <ResellerPackageCheckout unified businessId={businessId} locationId={locationId} onCancel={()=>setCreating(false)} onSaved={()=>{setCreating(false);void load();}}/>;
  return (
    <ScrollView
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <Pressable style={s.back} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color="#151924" />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.title}>Sales & Orders</Text>
          <Text style={s.help}>
            Website orders appear here automatically. Add Messenger or walk-in orders using the same products. Confirm payment, then prepare and send.
          </Text>
        </View>
      </View>
      {!creating ? (
        <Pressable style={s.primary} onPress={() => setCreating(true)}>
          <Ionicons name="add" size={21} color="white" />
          <Text style={s.primaryText}>Add order</Text>
        </Pressable>
      ) : (
        <View style={s.form}>
          <Text style={s.formTitle}>New pre-order</Text>
          <Field
            label="Customer name · Required"
            value={customer}
            setValue={setCustomer}
            placeholder="Customer name"
          />
          <Field
            label="Contact number or account"
            value={contact}
            setValue={setContact}
            placeholder="Phone, Facebook or other contact"
          />
          {packages.length ? (
            <>
              <Text style={s.label}>Choose a reseller package</Text>
              <View style={s.chips}>
                {packages.map((item) => (
                  <Chip
                    key={item.id}
                    label={`${item.name} · ${peso(Number(item.package_price_php))}`}
                    active={packageId === item.id}
                    onPress={() => {
                      setPackageId(item.id);
                      setProductId(null);
                      setProductName("");
                      setTotal(`${Number(item.package_price_php)}`);
                      setDeposit(`${Number(item.deposit_required_php)}`);
                      setQuantity("1");
                      setOptions(
                        (item.reseller_package_items ?? [])
                          .map((line) => `${line.quantity} × ${line.source_products?.name ?? "Product"}${line.choices_note ? ` (${line.choices_note})` : ""}`)
                          .join("; "),
                      );
                    }}
                  />
                ))}
              </View>
              <Text style={s.help}>The package price, deposit and included products are filled in automatically. You can still edit the customer’s choices.</Text>
            </>
          ) : null}
          <Text style={s.label}>Or choose an official product</Text>
          <View style={s.chips}>
            {products.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                active={productId === p.id}
                onPress={() => {
                  setProductId(p.id);
                  setVariantId(null);
                  setPackageId(null);
                  setProductName("");
                  if(p.selling_price_php)setTotal(String(p.selling_price_php));
                }}
              />
            ))}
          </View>
          {productId?<View style={s.chips}>{products.find(p=>p.id===productId)?.source_product_options.map(v=><Chip key={v.id} label={`${v.option_value} · ${v.stock_units} piece${v.stock_units===1?'':'s'} per selection`} active={variantId===v.id} onPress={()=>{setVariantId(v.id);if(v.selling_price_php)setTotal(String(v.selling_price_php));}}/>)}</View>:null}
          <Field
            label="Choices"
            value={options}
            setValue={setOptions}
            placeholder="Colour, size, type or variation"
          />
          <View style={s.row}>
            <View style={s.flex}>
              <Field
                label="Quantity"
                value={quantity}
                setValue={setQuantity}
                placeholder="1"
                numeric
              />
            </View>
            <View style={s.flex}>
              <Field
                label="Full price · PHP"
                value={total}
                setValue={setTotal}
                placeholder="0"
                numeric
              />
            </View>
          </View>
          <Field
            label="Deposit required · PHP"
            value={deposit}
            setValue={setDeposit}
            placeholder={
              total ? `${num(total) * 0.5} (50%)` : "Defaults to 50%"
            }
            numeric
          />
          <Field
            label="Delivery address · Can add later"
            value={address}
            setValue={setAddress}
            placeholder="Customer address"
            multiline
          />
          <Field
            label="Notes · Optional"
            value={notes}
            setValue={setNotes}
            placeholder="Anything the team needs to remember"
            multiline
          />
          <View style={s.row}>
            <Pressable
              style={s.secondary}
              onPress={() => {
                reset();
                setCreating(false);
              }}
            >
              <Text style={s.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={s.primarySmall}
              disabled={saving}
              onPress={() => void create()}
            >
              <Text style={s.primaryText}>
                {saving ? "Saving…" : "Save pre-order"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      <View style={s.tabs}>
        <Pressable
          style={[s.tab, filter === "active" && s.tabOn]}
          onPress={() => setFilter("active")}
        >
          <Text style={[s.tabText, filter === "active" && s.tabTextOn]}>
            Active{" "}
            {
              orders.filter(
                (o) =>
                  !["delivered", "cancelled"].includes(o.fulfilment_status),
              ).length
            }
          </Text>
        </Pressable>
        <Pressable
          style={[s.tab, filter === "completed" && s.tabOn]}
          onPress={() => setFilter("completed")}
        >
          <Text style={[s.tabText, filter === "completed" && s.tabTextOn]}>
            Completed{" "}
            {
              orders.filter((o) => o.fulfilment_status === "delivered").length + pastSales.filter(o=>o.status!=='cancelled').length
            }
          </Text>
        </Pressable>
        <Pressable style={[s.tab, filter === "cancelled" && s.tabOn]} onPress={() => setFilter("cancelled")}>
          <Text style={[s.tabText, filter === "cancelled" && s.tabTextOn]}>Cancelled {orders.filter(o => o.fulfilment_status === "cancelled").length + pastSales.filter(o=>o.status==='cancelled').length}</Text>
        </Pressable>
      </View>
      {pastSales.filter(o=>filter==='completed'?o.status!=='cancelled':filter==='cancelled'?o.status==='cancelled':false).map(o=><ViaeSaleCard key={o.id} kind="trade_sale" sale={{id:o.id,title:o.product_name,variant:o.variant_name,quantity:o.quantity,total:Number(o.amount_php),date:o.payment_date||o.entry_date,paymentMethod:({cash:'Cash',gcash:'GCash',bank:'Bank transfer',other:'Other'} as Record<string,string>)[o.payment_method]||o.payment_method,image:[...(o.source_products?.source_product_images??[])].sort((a,b)=>a.sort_order-b.sort_order)[0]?.image_url,notes:o.notes,cancelled:o.status==='cancelled'}}/>)}
      {shown.length === 0 && !pastSales.some(o=>filter==='completed'?o.status!=='cancelled':filter==='cancelled'?o.status==='cancelled':false) ? (
        <View style={s.empty}>
          <Text style={s.cardTitle}>No {filter} orders</Text>
        </View>
      ) : (
        shown.map((order) => {
          if(['delivered','cancelled'].includes(order.fulfilment_status)){
            const product=products.find(p=>p.id===order.reseller_order_stock_lines?.[0]?.source_product_id);
            const methods=[...new Set(order.reseller_preorder_payments.map(p=>({cash:'Cash',gcash:'GCash',bank:'Bank transfer',other:'Other'} as Record<string,string>)[p.payment_method]||p.payment_method))].join(' / ');
            return <ViaeSaleCard key={order.id} kind="preorder" sale={{id:order.id,title:order.product_name,variant:order.selected_options,quantity:order.quantity,total:paid(order),date:order.reseller_preorder_payments.map(p=>p.payment_date).sort().at(-1)||order.created_at,paymentMethod:methods,image:[...(product?.source_product_images??[])].sort((a,b)=>a.sort_order-b.sort_order)[0]?.image_url,customer:order.customer_name,notes:order.notes,cancelled:order.fulfilment_status==='cancelled',items:order.reseller_order_stock_lines?.map(line=>`${line.product_name}${line.variant_name?' · '+line.variant_name:''} × ${line.pieces}`)}}/>;
          }
          const totalPaid = paid(order),
            depositPaid = paid(order, "deposit"),
            amountDue = Math.max(
              0,
              Number(order.total_price_php) +
                Number(order.delivery_fee_php) -
                totalPaid,
            );
          const needsStock = (order.reseller_order_stock_lines??[]).some(line=>{
            const stock=stocks.find(s=>s.source_product_id===line.source_product_id&&s.source_product_option_id===line.source_product_option_id);
            const same=(order.reseller_order_stock_lines??[]).filter(s=>s.source_product_id===line.source_product_id&&s.source_product_option_id===line.source_product_option_id).reduce((n,s)=>n+s.pieces,0);
            return Number(stock?.on_hand??0)-Number(stock?.reserved??0)+(totalPaid>=Number(order.deposit_required_php)?same:0)<same;
          });
          const paymentLabel =
            totalPaid < Number(order.deposit_required_php)
              ? order.order_kind==='ready_stock' ? "Awaiting full payment" : "Awaiting deposit"
              : amountDue > 0
                ? "Pending final payment"
                : "Paid in full";
          return (
            <View key={order.id} style={s.card}>
              <Text style={s.help}>{({website:'Website',messenger:'Facebook / Messenger',walk_in:'Walk-in',other:'Other'} as Record<string,string>)[order.order_channel] || (order.notes?.startsWith('Website checkout')?'Website':'Other')} · {order.order_kind==='ready_stock'?'Ready stock':'Preorder'}</Text>
              <SaleReceipt kind="preorder" recordId={order.id} />
              {!['delivered','cancelled','shipped'].includes(order.fulfilment_status)?<Text style={s.help}>Next: {totalPaid<Number(order.deposit_required_php)?'Confirm the required payment.':needsStock?'Order from your supplier or print the missing items in Stock & printing.':!order.delivery_fee_confirmed?'Confirm local delivery cost. Use 0 for customer pickup.':amountDue>0?'Collect the remaining balance.':'Prepare the items, then send or hand over.'}</Text>:null}
              <View style={s.cardHead}>
                <View style={s.flex}>
                  <Text style={s.cardTitle}>{order.customer_name}</Text>
                  <Text style={s.help}>Order {order.id.slice(0,8)}</Text>
                  {order.customer_contact?<Text style={s.help}>{order.customer_contact}</Text>:null}
                  {order.delivery_address?<Text style={s.help}>{order.delivery_address}</Text>:null}
                  {order.notes?<Text style={s.help}>{order.notes}</Text>:null}
                  <Text style={s.product}>
                    {order.product_name} × {order.quantity}
                  </Text>
                  {order.selected_options ? (
                    <Text style={s.help}>{order.selected_options}</Text>
                  ) : null}
                  {order.reseller_order_stock_lines?.map((line,index)=><Text key={index} style={s.help}>{line.product_name}{line.variant_name?' · '+line.variant_name:''} · {line.pieces} stock items</Text>)}
                </View>
                <View style={s.status}>
                  <Text style={s.statusText}>
                    {statusName[order.fulfilment_status]}
                  </Text>
                </View>
              </View>
              <View style={s.money}>
                <Metric
                  label="Full price"
                  value={peso(Number(order.total_price_php))}
                />
                <Metric label="Paid" value={peso(totalPaid)} />
                <Metric
                  label="To collect"
                  value={peso(amountDue)}
                  alert={amountDue > 0}
                />
              </View>
              <View style={s.paymentState}>
                <Ionicons
                  name={amountDue <= 0 ? "checkmark-circle" : "wallet-outline"}
                  size={19}
                  color={amountDue <= 0 ? "#1B685C" : "#8A365B"}
                />
                <Text
                  style={[
                    s.paymentText,
                    { color: amountDue <= 0 ? "#1B685C" : "#8A365B" },
                  ]}
                >
                  {paymentLabel}
                </Text>
              </View>
              {paymentFor === order.id ? (
                <View style={s.inline}>
                  <Text style={s.formTitle}>Confirm money received</Text>
                  <Text style={s.help}>Check your bank or payment account first. A screenshot alone does not confirm payment. Record only the money actually received.</Text>
                  <View style={s.chips}>
                    {(["deposit", "final", "delivery"] as const).map((type) => (
                      <Chip
                        key={type}
                        label={
                          type === "deposit"
                            ? "Deposit"
                            : type === "final"
                              ? "Final payment"
                              : "Delivery fee"
                        }
                        active={paymentType === type}
                        onPress={() => setPaymentType(type)}
                      />
                    ))}
                  </View>
                  <Field
                    label="Amount · PHP"
                    value={paymentAmount}
                    setValue={setPaymentAmount}
                    placeholder={
                      paymentType === "deposit"
                        ? `${Math.max(0, Number(order.deposit_required_php) - depositPaid)}`
                        : `${amountDue}`
                    }
                    numeric
                  />
                  <Text style={s.label}>Paid using</Text>
                  <View style={s.chips}>
                    {["gcash", "cash", "bank", "other"].map((x) => (
                      <Chip
                        key={x}
                        label={
                          x === "gcash"
                            ? "GCash"
                            : x[0].toUpperCase() + x.slice(1)
                        }
                        active={method === x}
                        onPress={() => setMethod(x)}
                      />
                    ))}
                  </View>
                  <ExpenseDatePicker label="Payment date · Required" value={paymentDate} onChange={setPaymentDate}/>
                  <View style={s.row}>
                    <Pressable
                      style={s.secondary}
                      onPress={() => setPaymentFor(null)}
                    >
                      <Text style={s.secondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={s.primarySmall}
                      disabled={saving}
                      onPress={() => void recordPayment(order)}
                    >
                      <Text style={s.primaryText}>Save payment</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {deliveryFor === order.id ? (
                <View style={s.inline}>
                  <Text style={s.formTitle}>Customer delivery fee</Text>
                  <Text style={s.help}>
                    Enter zero if delivery is free. MIK will not allow shipping
                    until this is confirmed and the full balance is paid.
                  </Text>
                  <Field
                    label="Delivery fee · PHP"
                    value={deliveryFee}
                    setValue={setDeliveryFee}
                    placeholder="0"
                    numeric
                  />
                  <View style={s.row}>
                    <Pressable
                      style={s.secondary}
                      onPress={() => setDeliveryFor(null)}
                    >
                      <Text style={s.secondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={s.primarySmall}
                      onPress={() => void confirmDeliveryFee(order)}
                    >
                      <Text style={s.primaryText}>Confirm fee</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {shippingFor === order.id ? (
                <View style={s.inline}>
                  <Text style={s.formTitle}>Send or hand over</Text>
                  <Field
                    label="Courier or customer pickup · Required"
                    value={courier}
                    setValue={setCourier}
                    placeholder="J&T, LBC or Customer pickup"
                  />
                  <Field
                    label="Tracking number · Optional"
                    value={tracking}
                    setValue={setTracking}
                    placeholder="Tracking number"
                  />
                  <View style={s.row}>
                    <Pressable
                      style={s.secondary}
                      onPress={() => setShippingFor(null)}
                    >
                      <Text style={s.secondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={s.primarySmall}
                      onPress={() => void move(order, "shipped")}
                    >
                      <Text style={s.primaryText}>Confirm shipped</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {!["delivered", "cancelled"].includes(order.fulfilment_status) ? (
                <View style={s.actions}>
                  {order.fulfilment_status === "arrived" &&
                  !order.delivery_fee_confirmed ? (
                    <Pressable
                      style={s.nextButton}
                      onPress={() => {
                        setDeliveryFor(order.id);
                        setDeliveryFee(
                          `${Number(order.delivery_fee_php) || 0}`,
                        );
                      }}
                    >
                      <Text style={s.nextText}>Set customer delivery fee</Text>
                      <Ionicons
                        name="bicycle-outline"
                        size={18}
                        color="#315FBE"
                      />
                    </Pressable>
                  ) : null}
                  {amountDue > 0 ? (
                    <Pressable
                      style={s.payButton}
                      onPress={() => {
                        paymentRequest.current='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);});
                        setPaymentDate(displayDate(today()));
                        setPaymentFor(order.id);
                        setPaymentType(
                          order.order_kind!=='ready_stock' && totalPaid < Number(order.deposit_required_php)
                            ? "deposit"
                            : "final",
                        );
                        setPaymentAmount(
                          `${totalPaid < Number(order.deposit_required_php) ? Math.min(amountDue,Math.max(0, Number(order.deposit_required_php) - totalPaid)) : amountDue}`,
                        );
                      }}
                    >
                      <Ionicons name="wallet-outline" size={18} color="white" />
                      <Text style={s.actionWhite}>Confirm money received</Text>
                    </Pressable>
                  ) : null}
                  {order.fulfilment_status==='arrived' && order.delivery_fee_confirmed && amountDue===0 && !needsStock?<Pressable style={s.nextButton} onPress={()=>void move(order,'ready_to_ship')}><Text style={s.nextText}>Ready to send</Text></Pressable>:null}
                  {nextStep[order.fulfilment_status] && totalPaid>=Number(order.deposit_required_php) && (!['confirmed','ordered','in_transit'].includes(order.fulfilment_status)||!needsStock) ? (
                    <Pressable
                      style={s.nextButton}
                      onPress={() =>
                        void move(order, nextStep[order.fulfilment_status].next)
                      }
                    >
                      <Text style={s.nextText}>
                        {nextStep[order.fulfilment_status].label}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#315FBE"
                      />
                    </Pressable>
                  ) : null}
                  {!['shipped','delivered','cancelled'].includes(order.fulfilment_status)?<Pressable style={s.nextButton} onPress={()=>cancelOrder(order)}><Text style={s.nextText}>Cancel order</Text></Pressable>:null}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  setValue,
  placeholder,
  numeric = false,
  multiline = false,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.multiline]}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.chip, active && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}
function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, alert && { color: "#8A2943" }]}>
        {value}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  page: {
    padding: 18,
    paddingBottom: 80,
    width: "100%",
    boxSizing: "border-box",
    maxWidth: 980,
    alignSelf: "center",
    gap: 15,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E0E3EA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  title: { fontSize: 23, fontWeight: "700", color: "#151924" },
  help: { fontSize: 14, lineHeight: 20, color: "#626A78" },
  primary: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#594C8D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  primarySmall: {
    minHeight: 45,
    borderRadius: 12,
    backgroundColor: "#594C8D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 17,
    flex: 1,
  },
  primaryText: { fontSize: 15, fontWeight: "700", color: "white" },
  form: {
    padding: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DED9EB",
    backgroundColor: "#FAF9FC",
    gap: 12,
  },
  formTitle: { fontSize: 18, fontWeight: "700", color: "#151924" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#343A47" },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 16,
    color: "#151924",
    backgroundColor: "white",
  },
  multiline: { minHeight: 80, paddingTop: 11 },
  row: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    backgroundColor: "white",
  },
  chipOn: { backgroundColor: "#594C8D", borderColor: "#594C8D" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#4F5664" },
  chipTextOn: { color: "white" },
  secondary: {
    minHeight: 45,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9DDE5",
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 17,
    flex: 1,
  },
  secondaryText: { fontSize: 15, fontWeight: "700", color: "#4F5664" },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    backgroundColor: "#F2F3F6",
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: "#594C8D" },
  tabText: { fontSize: 14, fontWeight: "700", color: "#626A78" },
  tabTextOn: { color: "white" },
  empty: {
    padding: 28,
    borderWidth: 1,
    borderColor: "#E0E3EA",
    borderRadius: 17,
    alignItems: "center",
  },
  card: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E0E3EA",
    backgroundColor: "white",
    gap: 12,
  },
  cardHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#151924" },
  product: { fontSize: 16, fontWeight: "600", color: "#313744", marginTop: 3 },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F1F8",
    maxWidth: 150,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#594C8D",
    textAlign: "center",
  },
  money: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#F7F8FA",
    borderRadius: 13,
    padding: 11,
  },
  metric: { flex: 1, gap: 3 },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#737B89",
    textTransform: "uppercase",
  },
  metricValue: { fontSize: 16, fontWeight: "700", color: "#151924" },
  paymentState: { flexDirection: "row", alignItems: "center", gap: 7 },
  paymentText: { fontSize: 14, fontWeight: "700" },
  inline: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F7F6FA",
    borderWidth: 1,
    borderColor: "#E1DDEA",
    gap: 11,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  payButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#8A365B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    flexGrow: 1,
  },
  actionWhite: { fontSize: 14, fontWeight: "700", color: "white" },
  nextButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "#CFDBF2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    flexGrow: 1,
  },
  nextText: { fontSize: 14, fontWeight: "700", color: "#315FBE" },
});
import { SaleReceipt } from './SaleReceipt';
