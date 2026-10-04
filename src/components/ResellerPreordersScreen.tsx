import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { userNotice } from "@/src/lib/userNotice";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { Text, TextInput } from "@/src/components/AppTypography";

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
  reseller_preorder_payments: Payment[];
};
type SourceProduct = { id: string; name: string };
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
  awaiting_deposit: "Pending deposit",
  confirmed: "Deposit paid",
  ordered: "Ordered from supplier",
  in_transit: "Coming to us",
  arrived: "Arrived with us",
  ready_to_ship: "Paid · Ready to ship",
  shipped: "Shipped to customer",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const nextStep: Record<string, { label: string; next: string }> = {
  confirmed: { label: "Mark ordered from supplier", next: "ordered" },
  ordered: { label: "Mark as coming to us", next: "in_transit" },
  in_transit: { label: "Mark arrived with us", next: "arrived" },
  ready_to_ship: { label: "Mark shipped to customer", next: "shipped" },
  shipped: { label: "Mark delivered", next: "delivered" },
};

export function ResellerPreordersScreen({
  businessId,
  locationId,
  onBack,
}: {
  businessId: string;
  locationId: string;
  onBack: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<SourceProduct[]>([]);
  const [packages, setPackages] = useState<ResellerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
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
    const [{ data, error }, { data: sourceRows }, { data: packageRows }] = await Promise.all([
      supabase
        .from("reseller_preorders")
        .select(
          "id,customer_name,customer_contact,delivery_address,product_name,selected_options,quantity,total_price_php,deposit_required_php,delivery_fee_php,delivery_fee_confirmed,fulfilment_status,courier,tracking_number,created_at,reseller_preorder_payments(id,payment_type,amount_php,payment_method,payment_date)",
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false }),
      supabase
        .from("source_products")
        .select("id,name")
        .eq("business_id", businessId)
        .neq("idea_stage", "not_proceeding")
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
    setProducts((sourceRows ?? []) as SourceProduct[]);
    setPackages((packageRows ?? []) as unknown as ResellerPackage[]);
    setLoading(false);
  }, [businessId]);
  useEffect(() => {
    void load();
  }, [load]);
  const reset = () => {
    setCustomer("");
    setContact("");
    setAddress("");
    setProductId(null);
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
    if (!chosen)
      return userNotice(
        "Product needed",
        "Choose a product idea or type the item ordered.",
      );
    if (num(total) <= 0)
      return userNotice(
        "Full price needed",
        "Enter the customer's full order price.",
      );
    const depositRequired = deposit ? num(deposit) : num(total) * 0.5;
    setSaving(true);
    const { error } = await supabase.from("reseller_preorders").insert({
      business_id: businessId,
      location_id: locationId,
      source_product_id: productId,
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
    if (num(paymentAmount) <= 0) return userNotice("Payment amount needed");
    const savedDate = toIsoDate(paymentDate);
    if (!savedDate)
      return userNotice(
        "Check the payment date",
        "Use DD-MM-YYYY, for example 27-09-2026.",
      );
    setSaving(true);
    const { error } = await supabase.from("reseller_preorder_payments").insert({
      preorder_id: order.id,
      business_id: businessId,
      location_id: locationId,
      payment_type: paymentType,
      amount_php: num(paymentAmount),
      payment_method: method,
      payment_date: savedDate,
    });
    if (error) {
      setSaving(false);
      return userNotice("Payment not saved", error.message);
    }
    const newPaid = paid(order) + num(paymentAmount);
    const depositPaid =
      paid(order, "deposit") +
      (paymentType === "deposit" ? num(paymentAmount) : 0);
    let status = order.fulfilment_status;
    if (
      status === "awaiting_deposit" &&
      depositPaid >= Number(order.deposit_required_php)
    )
      status = "confirmed";
    if (
      ["arrived", "ready_to_ship"].includes(status) &&
      order.delivery_fee_confirmed &&
      newPaid >= Number(order.total_price_php) + Number(order.delivery_fee_php)
    )
      status = "ready_to_ship";
    if (status !== order.fulfilment_status)
      await supabase
        .from("reseller_preorders")
        .update({
          fulfilment_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    setSaving(false);
    setPaymentFor(null);
    setPaymentAmount("");
    await load();
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
      ? ["delivered", "cancelled"].includes(o.fulfilment_status)
      : !["delivered", "cancelled"].includes(o.fulfilment_status),
  );
  if (loading)
    return (
      <View style={s.loading}>
        <ActivityIndicator color="#594C8D" />
        <Text style={s.help}>Opening pre-orders…</Text>
      </View>
    );
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
          <Text style={s.title}>Customer pre-orders</Text>
          <Text style={s.help}>
            Deposit, arrival, final payment and customer delivery.
          </Text>
        </View>
      </View>
      {!creating ? (
        <Pressable style={s.primary} onPress={() => setCreating(true)}>
          <Ionicons name="add" size={21} color="white" />
          <Text style={s.primaryText}>Add customer pre-order</Text>
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
          <Text style={s.label}>Or choose one product idea</Text>
          <View style={s.chips}>
            {products.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                active={productId === p.id}
                onPress={() => {
                  setProductId(p.id);
                  setPackageId(null);
                  setProductName("");
                }}
              />
            ))}
          </View>
          <Field
            label="Or type another product"
            value={productName}
            setValue={(v) => {
              setProductName(v);
              if (v) {
                setProductId(null);
                setPackageId(null);
              }
            }}
            placeholder="Product name"
          />
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
              orders.filter((o) =>
                ["delivered", "cancelled"].includes(o.fulfilment_status),
              ).length
            }
          </Text>
        </Pressable>
      </View>
      {shown.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.cardTitle}>No {filter} pre-orders</Text>
        </View>
      ) : (
        shown.map((order) => {
          const totalPaid = paid(order),
            depositPaid = paid(order, "deposit"),
            amountDue = Math.max(
              0,
              Number(order.total_price_php) +
                Number(order.delivery_fee_php) -
                totalPaid,
            );
          const paymentLabel =
            depositPaid < Number(order.deposit_required_php)
              ? "Pending deposit"
              : amountDue > 0
                ? "Pending final payment"
                : "Paid in full";
          return (
            <View key={order.id} style={s.card}>
              <View style={s.cardHead}>
                <View style={s.flex}>
                  <Text style={s.cardTitle}>{order.customer_name}</Text>
                  <Text style={s.product}>
                    {order.product_name} × {order.quantity}
                  </Text>
                  {order.selected_options ? (
                    <Text style={s.help}>{order.selected_options}</Text>
                  ) : null}
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
                  <Text style={s.formTitle}>Record customer payment</Text>
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
                  <Field
                    label="Payment date · DD-MM-YYYY"
                    value={paymentDate}
                    setValue={setPaymentDate}
                    placeholder={displayDate(today())}
                  />
                  <View style={s.row}>
                    <Pressable
                      style={s.secondary}
                      onPress={() => setPaymentFor(null)}
                    >
                      <Text style={s.secondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={s.primarySmall}
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
                  <Text style={s.formTitle}>Customer shipment</Text>
                  <Field
                    label="Courier · Required"
                    value={courier}
                    setValue={setCourier}
                    placeholder="J&T, LBC or other courier"
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
                        setPaymentFor(order.id);
                        setPaymentType(
                          depositPaid < Number(order.deposit_required_php)
                            ? "deposit"
                            : "final",
                        );
                        setPaymentAmount(
                          `${depositPaid < Number(order.deposit_required_php) ? Math.max(0, Number(order.deposit_required_php) - depositPaid) : amountDue}`,
                        );
                      }}
                    >
                      <Ionicons name="wallet-outline" size={18} color="white" />
                      <Text style={s.actionWhite}>Record payment</Text>
                    </Pressable>
                  ) : null}
                  {nextStep[order.fulfilment_status] ? (
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
