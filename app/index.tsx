import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
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
import { useFonts } from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import { peso, shortDate } from "@/src/lib/format";
import { ReportsScreen } from "@/src/components/ReportsScreen";
import { OrdersScreen } from "@/src/components/OrdersScreen";
import { PrintersScreen } from "@/src/components/PrintersScreen";
import { FilamentsScreen } from "@/src/components/FilamentsScreen";
import { CalendarScreen, type ShopEvent } from "@/src/components/CalendarScreen";
import { PrintQueueScreen } from "@/src/components/PrintQueueScreen";
import { PrintPriceCalculator } from "@/src/components/PrintPriceCalculator";
import type {
  Business,
  CartItem,
  Category,
  Location,
  PaymentMethod,
  Product,
  ProductVariant,
  Profile,
  Role,
  Sale,
  Screen,
} from "@/src/types";

const APP_FONT = Platform.select({
  web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ios: "System",
  android: "sans-serif",
  default: "System",
});

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[{ fontFamily: APP_FONT }, style]} />;
}

function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={[{ fontFamily: APP_FONT }, style]} />;
}

function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function friendlyLocalDate(value = localDateKey()) {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function friendlyDateTime(value: string) {
  const date = new Date(value);
  return `${friendlyLocalDate(localDateKey(date))} · ${date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`;
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const C = {
  ink: "#101318",
  muted: "#626A73",
  green: "#142C47",
  dark: "#0D1722",
  soft: "#F6F7F8",
  accent: "#264A3B",
  accentDark: "#193529",
  accentSoft: "#F3F6F4",
  teal: "#29465B",
  tealSoft: "#F3F5F7",
  purple: "#65243A",
  purpleSoft: "#F8F4F5",
  cream: "#FFFFFF",
  white: "#FFFFFF",
  border: "#E0E3E7",
  orange: "#795C2D",
  orangeSoft: "#F8F6F1",
  red: "#65243A",
  redSoft: "#F8F4F5",
};
const SECTION = {
  sales: { color: "#142C47", soft: "#EEF3F8", border: "#D6E1EB" },
  stock: { color: "#264A3B", soft: "#F0F5F2", border: "#D6E3DC" },
  production: { color: "#65243A", soft: "#F8F1F3", border: "#E8D8DE" },
  records: { color: "#795C2D", soft: "#F8F6F1", border: "#E7DFD0" },
  settings: { color: "#4B5158", soft: "#F3F4F5", border: "#DFE1E3" },
  support: { color: "#5A405F", soft: "#F7F3F8", border: "#E5DCE7" },
} as const;
type Icon = keyof typeof Ionicons.glyphMap;
function categoryIcon(name: string): Icon {
  const n = name.toLowerCase();
  if (n.includes("keyboard") || n.includes("clicker") || n.includes("keycap")) return "keypad";
  if (n.includes("fidget")) return "sync";
  if (n.includes("keychain")) return "key";
  if (n.includes("decor") || n.includes("display")) return "sparkles";
  if (n.includes("home") || n.includes("gift")) return "home";
  return "cube";
}
function categoryTone(name: string) {
  const n = name.toLowerCase();
  if (n.includes("keyboard") || n.includes("clicker") || n.includes("keycap")) return { color: "#102A43", soft: "#F5F8FA" };
  if (n.includes("fidget") || n.includes("flexi")) return { color: "#29473A", soft: "#F6F8F7" };
  if (n.includes("keychain") || n.includes("charm")) return { color: "#70263A", soft: "#FAF6F7" };
  if (n.includes("decor") || n.includes("display")) return { color: "#5A405F", soft: "#F9F6F9" };
  if (n.includes("home") || n.includes("gift") || n.includes("desk")) return { color: "#49384E", soft: "#F8F6F8" };
  return { color: "#294B61", soft: "#F6F8F9" };
}
function productIcon(name: string, category = ""): Icon {
  const n = `${name} ${category}`.toLowerCase();
  if (n.includes("keychain") || n.includes("leather") || n.includes("paracord"))
    return "key";
  if (n.includes("keyboard") || n.includes("clicker")) return "keypad";
  if (n.includes("lamp") || n.includes("candle")) return "bulb";
  if (n.includes("vase") || n.includes("flower")) return "flower";
  if (n.includes("pen") || n.includes("pencil")) return "pencil";
  if (n.includes("phone") || n.includes("homepod")) return "phone-portrait";
  if (n.includes("organizer") || n.includes("holder"))
    return "file-tray-stacked";
  if (n.includes("dragon")) return "flame";
  if (n.includes("octopus") || n.includes("starfish")) return "fish";
  if (
    n.includes("bear") ||
    n.includes("puppy") ||
    n.includes("owl") ||
    n.includes("gorilla")
  )
    return "paw";
  if (n.includes("heart")) return "heart";
  if (n.includes("pickleball") || n.includes("paddle")) return "tennisball";
  if (n.includes("skull") || n.includes("skeleton")) return "skull";
  if (n.includes("ice cream")) return "ice-cream";
  if (n.includes("dumpling")) return "restaurant";
  if (n.includes("egg")) return "egg";
  if (
    n.includes("name") ||
    n.includes("letter") ||
    n.includes("welcome") ||
    n.includes("pray")
  )
    return "text";
  if (n.includes("fidget")) return "sync";
  return categoryIcon(category);
}
function placeholderImage(name: string) {
  const value = name.toLowerCase();
  if (value.includes("keyboard") || value.includes("clicker"))
    return require("../assets/product-placeholders/keyboard-clicker.png");
  if (value.includes("dragon"))
    return require("../assets/product-placeholders/rainbow-dragon.png");
  if (value.includes("starfish"))
    return require("../assets/product-placeholders/starfish-fidget.png");
  return null;
}
const ownerNav: {
  id: Screen;
  label: string;
  icon: Icon;
  color: string;
  soft: string;
}[] = [
  {
    id: "home",
    label: "Home",
    icon: "home-outline",
    color: SECTION.settings.color,
    soft: C.soft,
  },
  {
    id: "sell_start",
    label: "Sell",
    icon: "cart-outline",
    color: SECTION.sales.color,
    soft: SECTION.sales.soft,
  },
  {
    id: "orders",
    label: "Orders",
    icon: "clipboard-outline",
    color: SECTION.sales.color,
    soft: SECTION.sales.soft,
  },
  {
    id: "stock_start",
    label: "Stock",
    icon: "cube-outline",
    color: SECTION.stock.color,
    soft: SECTION.stock.soft,
  },
  {
    id: "more",
    label: "More",
    icon: "grid-outline",
    color: SECTION.settings.color,
    soft: SECTION.settings.soft,
  },
];

export default function Home() {
  const [iconsReady] = useFonts(Ionicons.font);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!iconsReady)
    return <SafeAreaView style={s.loading}><ActivityIndicator size="large" color={C.green} /></SafeAreaView>;
  return session ? <DeviceUserGate session={session} /> : <Login />;
}

function DeviceUserGate({session}:{session:Session}) {
  const storageKey=`mik-device-user-${session.user.id}`;
  const [loading,setLoading]=useState(true);
  const [name,setName]=useState("");
  const [draft,setDraft]=useState("");
  const [editing,setEditing]=useState(false);
  const [recorded,setRecorded]=useState(false);
  useEffect(()=>{AsyncStorage.getItem(storageKey).then(value=>{setName(value??"");setDraft(value??"");setLoading(false);});},[storageKey]);
  useEffect(()=>{
    if(loading||!name||recorded)return;
    setRecorded(true);
    void supabase.rpc("record_login_activity",{p_device_name:name});
  },[loading,name,recorded]);
  const save=async()=>{
    const clean=draft.trim().replace(/\s+/g," ");
    if(clean.length<2)return Alert.alert("Enter a name","Use a name such as Anna, Cashier 1 or Front Counter.");
    if(clean.length>30)return Alert.alert("Name is too long","Use 30 characters or fewer.");
    await AsyncStorage.setItem(storageKey,clean);
    setName(clean);setDraft(clean);setEditing(false);
  };
  if(loading)return <SafeAreaView style={s.loading}><ActivityIndicator size="large" color={C.green}/><Text style={s.help}>Opening MIK…</Text></SafeAreaView>;
  if(!name||editing)return <SafeAreaView style={s.deviceWelcome}><View style={s.deviceWelcomeCard}><Image source={require("../assets/mik-app-icon.png")} style={s.deviceWelcomeLogo}/><Text style={s.deviceWelcomeKicker}>{editing?"THIS DEVICE":"FIRST TIME ON THIS DEVICE"}</Text><Text style={s.deviceWelcomeTitle}>{editing?"Change your name":"Who is using MIK?"}</Text><Text style={s.centerHelp}>Use a short name so MIK can guide and greet you personally.</Text><Text style={s.deviceWelcomeFieldLabel}>Your name</Text><TextInput style={[s.input,s.deviceWelcomeInput]} value={draft} onChangeText={setDraft} placeholder="Example: Anna or Cashier 1" autoCapitalize="words" maxLength={30} onSubmitEditing={()=>void save()}/><View style={s.deviceWelcomeButton}><BigButton label={editing?"Save name":"Continue to MIK"} icon="arrow-forward" onPress={()=>void save()}/></View>{editing?<Pressable style={s.cancel} onPress={()=>{setDraft(name);setEditing(false);}}><Text style={s.help}>Cancel</Text></Pressable>:null}</View></SafeAreaView>;
  return <SignedIn session={session} deviceUserName={name} onChangeDeviceUser={()=>setEditing(true)}/>;
}

function Login() {
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const signIn = async () => {
    const clean = username.trim().toLowerCase();
    if (!clean || !password) {
      setError("Please enter your username and password.");
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(clean)) {
      setError("Please check the username and try again.");
      return;
    }
    if (clean === "sebu3d" || clean === "3dprints") {
      setError("Please use the new shop username: pixelbug");
      return;
    }
    setBusy(true);
    setError("");
    let { error: e } = await supabase.auth.signInWithPassword({
      email: `${clean}@login.mik.app`,
      password,
    });
    // The first Pixelbug profile originally used a hidden legacy login. Keep a
    // safe fallback until the Owner saves its username through the new portal.
    if (e && clean === "pixelbug") {
      ({ error: e } = await supabase.auth.signInWithPassword({
        email: "sebu3d@login.mik.app",
        password,
      }));
    }
    setBusy(false);
    if (e)
      setError("The username or password is not correct. Please try again.");
  };
  return (
    <SafeAreaView style={s.login}>
      <StatusBar style="dark" />
      <View style={[s.loginShell, wide && s.loginShellWide]}>
        {wide ? <View style={s.loginEditorial}><Text style={s.loginKicker}>MIK · MIKAEL</Text><Text style={s.loginEditorialTitle}>Your 3D printing shop, made simple.</Text><Text style={s.loginEditorialBody}>Sell products · Track stock · Follow every order</Text></View> : null}
        <View style={[s.loginCard, wide && s.loginCardWide]}>
        <Image
          source={require("../assets/mik-logo.png")}
          style={s.brandLogo}
          resizeMode="cover"
        />
        {!wide?<Text style={s.loginMobileName}>MIK. · MIKAEL</Text>:null}
        <Text style={s.loginTitle}>Welcome back.</Text>
        <Text style={s.centerHelp}>Your shop is ready for the day.</Text>
        <Label>Username</Label>
        <TextInput
          style={s.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Your username"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Label>Password</Label>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          onSubmitEditing={signIn}
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <BigButton
          label={busy ? "Opening your shop…" : "Continue"}
          icon="arrow-forward-circle-outline"
          onPress={signIn}
          disabled={busy}
        />
        <Pressable style={s.guidePreview} onPress={() => setGuideOpen(true)}>
          <Ionicons name="help-circle-outline" size={21} color={C.green} />
          <Text style={s.guidePreviewText}>See how Mik works</Text>
        </Pressable>
        </View>
      </View>
      <Text style={s.loginCredit}>Commit your work to the Lord, and your plans will succeed. · Proverbs 16:3 · Made with faith and love by Esther</Text>
      <GuideModal visible={guideOpen} onClose={() => setGuideOpen(false)} />
    </SafeAreaView>
  );
}

function SignedIn({ session,deviceUserName,onChangeDeviceUser }: { session: Session;deviceUserName:string;onChangeDeviceUser:()=>void }) {
  const [checking, setChecking] = useState(true);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => {
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPlatformAdmin(Boolean(data));
        setChecking(false);
      });
  }, [session.user.id]);
  if (checking)
    return (
      <SafeAreaView style={s.loading}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={s.help}>Opening your account…</Text>
      </SafeAreaView>
    );
  return platformAdmin ? <PlatformAdmin deviceUserName={deviceUserName} /> : <ShopApp session={session} deviceUserName={deviceUserName} onChangeDeviceUser={onChangeDeviceUser} />;
}

type AdminShop = {
  id: string;
  name: string;
  logo_url: string | null;
  slug: string | null;
  login_username: string | null;
  status: string;
  created_at: string;
  last_login?: string | null;
};
function PlatformAdmin({deviceUserName}:{deviceUserName:string}) {
  const {width}=useWindowDimensions();
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [openShop, setOpenShop] = useState<AdminShop | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [staffShop, setStaffShop] = useState<AdminShop | null>(null);
  const [actionShop,setActionShop]=useState<AdminShop|null>(null);
  const [manageShop, setManageShop] = useState<{ shop: AdminShop; mode: "edit" | "duplicate" } | null>(null);
  const [ownerStats, setOwnerStats] = useState({ salesToday: 0, activeOrders: 0, lowStock: 0 });
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ data, error }, { data: loginRows }, { data: todaySales }, { data: activeOrders }, { data: stockRows }] = await Promise.all([
      supabase.from("businesses").select("id,name,logo_url,slug,login_username,status,created_at").order("created_at"),
      supabase.from("activity_logs").select("business_id,created_at").eq("action", "login").order("created_at", { ascending: false }).limit(1000),
      supabase.from("sales").select("total,status").eq("status", "completed").gte("created_at", today.toISOString()),
      supabase.from("external_orders").select("id,status").not("status", "in", "(completed,cancelled)"),
      supabase.from("inventory_levels").select("quantity_on_hand,product:products!inner(low_stock_threshold,active)").eq("product.active", true),
    ]);
    if (error) Alert.alert("Shops not loaded", error.message);
    const lastLogin = new Map<string, string>();
    for (const row of loginRows ?? []) if (row.business_id && !lastLogin.has(row.business_id)) lastLogin.set(row.business_id, row.created_at);
    setShops(((data ?? []) as AdminShop[]).map((shop) => ({ ...shop, last_login: lastLogin.get(shop.id) ?? null })));
    setOwnerStats({
      salesToday: (todaySales ?? []).reduce((sum, sale) => sum + Number(sale.total), 0),
      activeOrders: activeOrders?.length ?? 0,
      lowStock: (stockRows ?? []).filter((row: any) => row.quantity_on_hand <= Number(row.product?.low_stock_threshold ?? 0)).length,
    });
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const create = async () => {
    const clean = username.trim().toLowerCase();
    if (!name.trim()) return Alert.alert("Enter a shop name");
    if (!/^[a-z0-9._-]{3,30}$/.test(clean))
      return Alert.alert(
        "Check the username",
        "Use 3–30 letters, numbers, dots, dashes or underscores.",
      );
    if (password.length < 6)
      return Alert.alert("Password is too short", "Use at least 6 characters.");
    setCreating(true);
    const { error } = await supabase.functions.invoke("admin-create-shop", {
      body: { shopName: name.trim(), username: clean, password },
    });
    setCreating(false);
    if (error) return Alert.alert("Profile not created", error.message);
    setName("");
    setUsername("");
    setPassword("");
    setShowForm(false);
    await load();
    Alert.alert(
      "Shop profile created",
      `${clean} can now log in to this shop.`,
    );
  };
  const setShopStatus = (shop: AdminShop) => {
    const pausing = shop.status === "active";
    const run = async () => {
      const { error } = await supabase.functions.invoke("admin-manage-shop", {
        body: { action: "set_status", shopId: shop.id, status: pausing ? "inactive" : "active" },
      });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error ?? message; } catch {}
        return Alert.alert("Shop status not changed", message);
      }
      await load();
      Alert.alert(pausing ? "Shop paused" : "Shop reactivated", pausing ? "This shop cannot start a new login until you reactivate it." : "This shop can sign in again.");
    };
    if (pausing) confirmDestructive("Pause this shop?", `${shop.name} will be blocked from new logins. Its data will remain safe.`, "Pause shop", () => void run());
    else void run();
  };
  const exportOwnerSales = async () => {
    setExporting(true);
    const { data, error } = await supabase.from("sales").select("receipt_number,created_at,payment_method,total,status,business:businesses(name)").order("created_at", { ascending: false });
    setExporting(false);
    if (error) return Alert.alert("Export not created", error.message);
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["Shop", "Date", "Receipt", "Payment", "Total", "Status"], ...(data ?? []).map((sale: any) => [sale.business?.name ?? "", sale.created_at, `SALE-${sale.receipt_number}`, String(sale.payment_method).toUpperCase(), sale.total, String(sale.status).toUpperCase()])];
    const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\n");
    const filename = `mik-all-shops-sales-${friendlyLocalDate()}.csv`;
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); return;
    }
    const file = new File(Paths.cache, filename); file.create(); file.write(csv); await Sharing.shareAsync(file.uri);
  };
  if (openShop)
    return (
      <ShopApp
        adminBusiness={openShop}
        onAdminExit={() => setOpenShop(null)}
      />
    );
  if (manageShop)
    return <AdminShopForm shop={manageShop.shop} mode={manageShop.mode} onBack={() => setManageShop(null)} onDone={async () => { setManageShop(null); await load(); }} />;
  if (showActivity)
    return <OwnerActivityLog shops={shops} onBack={() => setShowActivity(false)} />;
  if (showIssues)
    return <OwnerIssueReports onBack={() => setShowIssues(false)} />;
  if (showAccounts)
    return <OwnerAccounts onBack={() => setShowAccounts(false)} onManage={(account)=>{const shop=shops.find(item=>item.id===account.shop_id);if(!shop)return;setShowAccounts(false);if(account.role==="staff")setStaffShop(shop);else setActionShop(shop);}} />;
  if (staffShop)
    return <AdminStaffManager shop={staffShop} onBack={() => setStaffShop(null)} />;
  if(actionShop)
    return <SafeAreaView style={s.app}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.adminPage}><Back title="Shop profiles" onPress={()=>setActionShop(null)}/><View style={s.manageShopHero}><View style={s.shopAvatar}><Ionicons name="storefront" size={25} color={C.green}/></View><View style={s.flex}><Text style={s.pageTitle}>{actionShop.name}</Text><Text style={s.subtitle}>Choose what you want to manage.</Text></View></View><View style={s.manageShopGrid}>
      <Pressable style={s.manageShopCard} onPress={()=>{setStaffShop(actionShop);setActionShop(null);}}><View style={[s.quickIcon,{backgroundColor:SECTION.sales.color}]}><Ionicons name="people-outline" size={24} color={C.white}/></View><Text style={s.quickTitle}>Staff accounts</Text><Text style={s.quickHelp}>Create staff and choose their access</Text><Ionicons name="arrow-forward" size={20} color={SECTION.sales.color}/></Pressable>
      <Pressable style={s.manageShopCard} onPress={()=>{setManageShop({shop:actionShop,mode:"edit"});setActionShop(null);}}><View style={[s.quickIcon,{backgroundColor:SECTION.settings.color}]}><Ionicons name="create-outline" size={24} color={C.white}/></View><Text style={s.quickTitle}>Edit shop</Text><Text style={s.quickHelp}>Change its name, username or password</Text><Ionicons name="arrow-forward" size={20} color={SECTION.settings.color}/></Pressable>
      <Pressable style={s.manageShopCard} onPress={()=>{setManageShop({shop:actionShop,mode:"duplicate"});setActionShop(null);}}><View style={[s.quickIcon,{backgroundColor:SECTION.records.color}]}><Ionicons name="copy-outline" size={24} color={C.white}/></View><Text style={s.quickTitle}>Copy shop</Text><Text style={s.quickHelp}>Create another shop from this profile</Text><Ionicons name="arrow-forward" size={20} color={SECTION.records.color}/></Pressable>
      <Pressable style={s.manageShopCard} onPress={()=>setShopStatus(actionShop)}><View style={[s.quickIcon,{backgroundColor:actionShop.status==="active"?C.red:C.green}]}><Ionicons name={actionShop.status==="active"?"pause-circle-outline":"play-circle-outline"} size={24} color={C.white}/></View><Text style={s.quickTitle}>{actionShop.status==="active"?"Pause shop":"Activate shop"}</Text><Text style={s.quickHelp}>{actionShop.status==="active"?"Stop new logins without deleting data":"Allow this shop to sign in again"}</Text><Ionicons name="arrow-forward" size={20} color={actionShop.status==="active"?C.red:C.green}/></Pressable>
    </View></ScrollView></SafeAreaView>;
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.adminTop}>
        <View>
          <Text style={s.kicker}>OWNER · {deviceUserName}</Text>
          <Text style={s.shopName}>Shop profiles</Text>
        </View>
        <Pressable
          style={s.adminSignout}
          onPress={() => supabase.auth.signOut()}
        >
          <Ionicons name="log-out-outline" size={22} color={C.red} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.adminPage}>
        <View style={s.adminHero}>
          <Text style={s.heroLabel}>ACTIVE SHOP PROFILES</Text>
          <Text style={s.heroValue}>{shops.filter((shop) => shop.status === "active").length}</Text>
        </View>
        <View style={s.ownerStatsRow}>
          <View style={s.ownerStatCard}><Text style={s.ownerStatLabel}>SALES TODAY</Text><Text style={s.ownerStatValue}>{peso(ownerStats.salesToday)}</Text></View>
          <View style={s.ownerStatCard}><Text style={s.ownerStatLabel}>ACTIVE ORDERS</Text><Text style={s.ownerStatValue}>{ownerStats.activeOrders}</Text></View>
          <View style={s.ownerStatCard}><Text style={s.ownerStatLabel}>LOW STOCK</Text><Text style={s.ownerStatValue}>{ownerStats.lowStock}</Text></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open shop activity log" style={s.activityButton} onPress={() => setShowActivity(true)}>
          <View style={s.activityButtonIcon}><Ionicons name="time-outline" size={23} color={C.white} /></View>
          <View style={s.flex}><Text style={s.activityButtonTitle}>Shop activity</Text><Text style={s.activityButtonHelp}>Sales, products, stock, orders and logins</Text></View>
          <Ionicons name="chevron-forward" size={21} color={C.green} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open problem reports" style={s.activityButton} onPress={() => setShowIssues(true)}>
          <View style={[s.activityButtonIcon,{backgroundColor:C.accent}]}><Ionicons name="chatbox-ellipses-outline" size={23} color={C.white} /></View>
          <View style={s.flex}><Text style={s.activityButtonTitle}>Problem reports</Text><Text style={s.activityButtonHelp}>Messages sent by shop users</Text></View>
          <Ionicons name="chevron-forward" size={21} color={C.accent} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="View all accounts" style={s.activityButton} onPress={() => setShowAccounts(true)}>
          <View style={[s.activityButtonIcon,{backgroundColor:SECTION.support.color}]}><Ionicons name="people-outline" size={23} color={C.white} /></View>
          <View style={s.flex}><Text style={s.activityButtonTitle}>All accounts</Text><Text style={s.activityButtonHelp}>Shop owners, shop logins and staff</Text></View>
          <Ionicons name="chevron-forward" size={21} color={SECTION.support.color} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Export all shop sales" style={s.ownerExportButton} onPress={() => void exportOwnerSales()} disabled={exporting}>
          <Ionicons name="download-outline" size={22} color={C.accent} />
          <View style={s.flex}><Text style={s.ownerExportTitle}>{exporting ? "Preparing export…" : "Export all shop sales"}</Text><Text style={s.rowHelp}>One Excel-ready CSV for every shop</Text></View>
        </Pressable>
        {showForm ? (
          <View style={s.editCard}>
            <Text style={s.editName}>Create a shop profile</Text>
            <Label>Shop name</Label>
            <TextInput
              style={s.input}
              placeholder="Example: Ana's Mini Mart"
              value={name}
              onChangeText={setName}
            />
            <Label>Username</Label>
            <TextInput
              style={s.input}
              placeholder="Example: anashop"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Label>Starting password</Label>
            <TextInput
              style={s.input}
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <BigButton
              label={creating ? "Creating profile…" : "Create shop profile"}
              icon="person-add-outline"
              onPress={create}
              disabled={creating}
            />
            <Pressable style={s.cancel} onPress={() => setShowForm(false)}>
              <Text style={s.help}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <BigButton
            label="Create another shop profile"
            icon="add-circle-outline"
            onPress={() => setShowForm(true)}
          />
        )}
        <Text style={s.section}>All shops</Text>
        {loading ? (
          <ActivityIndicator color={C.green} />
        ) : (
          shops.map((shop) => (
            <View key={shop.id} style={s.adminShop}>
              <View style={s.adminShopTop}>
                <View style={s.shopAvatar}><Ionicons name="storefront" size={24} color={C.green} /></View>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>{shop.name}</Text>
                  <Text style={s.rowHelp}><Ionicons name="person-circle-outline" size={14} color={C.muted} />{" "}{shop.slug === "sebu3d" ? "pixelbug" : shop.login_username ?? "No username connected"}</Text>
                  <Text style={s.adminLastLogin}>{shop.last_login ? `Last login: ${friendlyDateTime(shop.last_login)}` : "No login recorded yet"}</Text>
                </View>
                <View style={[s.statusPill, shop.status !== "active" && s.statusPillPaused]}><Text style={[s.statusText, shop.status !== "active" && s.statusTextPaused]}>{shop.status === "active" ? "ACTIVE" : "PAUSED"}</Text></View>
              </View>
              <View style={[s.adminShopActions,width<620&&s.adminShopActionsMobile]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Manage ${shop.name}`}
                style={[s.adminShopAction,s.adminShopActionHalf]}
                onPress={() => setActionShop(shop)}
              >
                <Ionicons name="options-outline" size={21} color={C.green} /><Text style={s.adminShopActionText}>Manage shop</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${shop.name}`}
                style={[s.adminShopAction,s.adminShopActionHalf,s.adminShopActionPrimary]}
                onPress={() => setOpenShop(shop)}
              >
                <Ionicons name="enter-outline" size={21} color={C.white} /><Text style={[s.adminShopActionText, { color: C.white }]}>Open shop</Text>
              </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type StaffPermission = "sell"|"sales"|"orders"|"stock"|"products"|"reports"|"production"|"calendar"|"settings";
type OwnerAccount = {user_id:string;shop_id:string|null;shop_name:string;display_name:string;login_username:string;role:"platform_owner"|"shop_owner"|"staff";permissions:StaffPermission[];active:boolean;created_at:string|null;last_login:string|null};
function OwnerAccounts({onBack,onManage}:{onBack:()=>void;onManage:(account:OwnerAccount)=>void}){
  const [accounts,setAccounts]=useState<OwnerAccount[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<"all"|"owners"|"staff">("all");
  const load=useCallback(async()=>{
    setLoading(true);
    const {data,error}=await supabase.functions.invoke("admin-list-accounts",{body:{}});
    if(error){let message=error.message;try{message=(await error.context?.json())?.error??message;}catch{}Alert.alert("Accounts not loaded",message);}
    else setAccounts(data?.accounts??[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  const shown=accounts.filter(account=>filter==="all"||(filter==="staff"?account.role==="staff":account.role!=="staff"));
  const roleName=(role:OwnerAccount["role"])=>role==="platform_owner"?"MIK OWNER":role==="shop_owner"?"SHOP OWNER":"STAFF";
  return <SafeAreaView style={s.app}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.adminPage}>
    <Back title="Owner portal" onPress={onBack}/>
    <Text style={s.pageTitle}>All accounts</Text><Text style={s.subtitle}>Every username connected to MIK and its shop.</Text>
    <View style={s.accountSafetyNote}><Ionicons name="shield-checkmark-outline" size={22} color={SECTION.support.color}/><Text style={s.accountSafetyText}>Passwords cannot be viewed. To give someone access, change their password from Manage shop.</Text></View>
    <View style={s.stockSortRow}><Chip label={`All ${accounts.length}`} selected={filter==="all"} onPress={()=>setFilter("all")}/><Chip label="Owners" selected={filter==="owners"} onPress={()=>setFilter("owners")}/><Chip label="Staff" selected={filter==="staff"} onPress={()=>setFilter("staff")}/></View>
    {loading?<ActivityIndicator color={C.green}/>:shown.length?shown.map(account=><View key={`${account.shop_id??"platform"}-${account.user_id}`} style={s.accountListCard}>
      <View style={s.adminShopTop}><View style={[s.shopAvatar,{backgroundColor:account.role==="platform_owner"?SECTION.support.soft:account.role==="shop_owner"?SECTION.records.soft:SECTION.sales.soft}]}><Ionicons name={account.role==="staff"?"person-outline":"person-circle-outline"} size={24} color={account.role==="platform_owner"?SECTION.support.color:account.role==="shop_owner"?SECTION.records.color:SECTION.sales.color}/></View><View style={s.flex}><Text style={s.rowTitle}>{account.display_name}</Text><Text style={s.accountUsername}>@{account.login_username}</Text><Text style={s.rowHelp}>{account.shop_name}</Text></View><View style={[s.statusPill,!account.active&&s.statusPillPaused]}><Text style={[s.statusText,!account.active&&s.statusTextPaused]}>{account.active?"ACTIVE":"DISABLED"}</Text></View></View>
      <View style={s.accountMetaRow}><Text style={s.accountRole}>{roleName(account.role)}</Text><Text style={s.adminLastLogin}>{account.last_login?`Last login: ${friendlyDateTime(account.last_login)}`:"No login yet"}</Text></View>
      {account.role==="staff"&&account.permissions.length?<Text style={s.staffAccessSummary}>{account.permissions.map(id=>STAFF_PERMISSIONS.find(item=>item.id===id)?.label).filter(Boolean).join(" · ")}</Text>:null}
      {account.shop_id?<Pressable style={s.accountManageButton} onPress={()=>onManage(account)}><Ionicons name="settings-outline" size={18} color={C.green}/><Text style={s.accountManageText}>Manage account</Text><Ionicons name="chevron-forward" size={18} color={C.green}/></Pressable>:null}
    </View>):<Empty title="No accounts found"/>}
  </ScrollView></SafeAreaView>;
}
type AdminStaff = { user_id:string;display_name:string;login_username:string;permissions:StaffPermission[];active:boolean;created_at:string;last_login:string|null };
const STAFF_PERMISSIONS:Array<{id:StaffPermission;label:string;help:string;icon:Icon}>=[
  {id:"sell",label:"Make sales",help:"Shop and Event checkout",icon:"cart-outline"},
  {id:"sales",label:"View sales",help:"Today, history and corrections",icon:"receipt-outline"},
  {id:"orders",label:"Customer orders",help:"Create and update orders",icon:"clipboard-outline"},
  {id:"stock",label:"Update stock",help:"Counts and A–Z keycaps",icon:"layers-outline"},
  {id:"products",label:"Manage products",help:"Create, edit and delete products",icon:"cube-outline"},
  {id:"reports",label:"Reports and exports",help:"Sales reports and Excel files",icon:"bar-chart-outline"},
  {id:"production",label:"Production",help:"Print Queue, printers and filament",icon:"construct-outline"},
  {id:"calendar",label:"Calendar",help:"Events and reminders",icon:"calendar-outline"},
  {id:"settings",label:"Shop settings",help:"Shop details and advanced tools",icon:"settings-outline"},
];
const STAFF_PRESETS={
  Cashier:["sell","sales"] as StaffPermission[],
  "Sales team":["sell","sales","orders","calendar"] as StaffPermission[],
  Manager:STAFF_PERMISSIONS.map(x=>x.id).filter(x=>x!=="settings"),
};

function AdminStaffManager({shop,onBack}:{shop:AdminShop;onBack:()=>void}){
  const {width}=useWindowDimensions();
  const [staff,setStaff]=useState<AdminStaff[]>([]);
  const [loading,setLoading]=useState(true);
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState("");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [permissions,setPermissions]=useState<StaffPermission[]>(STAFF_PRESETS.Cashier);
  const [editing,setEditing]=useState<AdminStaff|null>(null);
  const [passwordPerson,setPasswordPerson]=useState<AdminStaff|null>(null);
  const [newPassword,setNewPassword]=useState("");
  const invoke=async(body:Record<string,unknown>)=>{
    const {data,error}=await supabase.functions.invoke("admin-manage-staff",{body:{shopId:shop.id,...body}});
    if(error){let message=error.message;try{message=(await error.context?.json())?.error??message;}catch{}throw new Error(message);}
    return data;
  };
  const load=useCallback(async()=>{setLoading(true);try{const data=await invoke({action:"list"});setStaff(data.staff??[]);}catch(e){Alert.alert("Staff not loaded",e instanceof Error?e.message:"Please try again.");}finally{setLoading(false);}},[shop.id]);
  useEffect(()=>{void load();},[load]);
  const toggle=(id:StaffPermission,setter:(value:StaffPermission[])=>void,current:StaffPermission[])=>setter(current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  const create=async()=>{
    setCreating(true);try{const data=await invoke({action:"create",displayName:name,username,password,permissions});setName("");setUsername("");setPassword("");setPermissions(STAFF_PRESETS.Cashier);await load();Alert.alert("Staff account created",`Login username: ${data.loginUsername}`);}catch(e){Alert.alert("Staff not created",e instanceof Error?e.message:"Please check the details.");}finally{setCreating(false);}
  };
  const savePermissions=async()=>{if(!editing)return;try{await invoke({action:"permissions",userId:editing.user_id,permissions:editing.permissions});setEditing(null);await load();Alert.alert("Access updated",`${editing.display_name} will see only the selected functions.`);}catch(e){Alert.alert("Access not updated",e instanceof Error?e.message:"Please try again.");}};
  const resetPassword=async()=>{if(!passwordPerson)return;try{await invoke({action:"password",userId:passwordPerson.user_id,password:newPassword});setPasswordPerson(null);setNewPassword("");Alert.alert("Password changed");}catch(e){Alert.alert("Password not changed",e instanceof Error?e.message:"Please try again.");}};
  const setStatus=(person:AdminStaff)=>Alert.alert(person.active?"Disable this staff account?":"Enable this staff account?",person.active?"They will not be able to sign in. Their history stays saved.":"They will be able to sign in again.",[{text:"Cancel",style:"cancel"},{text:person.active?"Disable":"Enable",style:person.active?"destructive":"default",onPress:async()=>{try{await invoke({action:"status",userId:person.user_id,active:!person.active});await load();}catch(e){Alert.alert("Account not changed",e instanceof Error?e.message:"Please try again.");}}}]);
  const permissionGrid=(current:StaffPermission[],setter:(value:StaffPermission[])=>void)=><View style={s.staffPermissionGrid}>{STAFF_PERMISSIONS.map(item=><Pressable key={item.id} style={[s.staffPermissionCard,current.includes(item.id)&&s.staffPermissionCardOn]} onPress={()=>toggle(item.id,setter,current)}><Ionicons name={item.icon} size={21} color={current.includes(item.id)?C.white:C.green}/><View style={s.flex}><Text style={[s.staffPermissionTitle,current.includes(item.id)&&{color:C.white}]}>{item.label}</Text><Text style={[s.staffPermissionHelp,current.includes(item.id)&&{color:"#E6EFEA"}]}>{item.help}</Text></View><Ionicons name={current.includes(item.id)?"checkmark-circle":"ellipse-outline"} size={21} color={current.includes(item.id)?C.white:C.muted}/></Pressable>)}</View>;
  return <SafeAreaView style={s.app}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.adminPage}><Back title="Manage staff" onPress={onBack}/><Text style={s.pageTitle}>{shop.name} staff</Text><Text style={s.subtitle}>Each person sees only the functions you select.</Text>
    <View style={s.editCard}><Text style={s.editName}>Create staff account</Text><Label>Staff name</Label><TextInput style={s.input} value={name} onChangeText={setName} placeholder="Example: Anna"/><Label>Short username</Label><TextInput style={s.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Example: anna"/><Text style={s.rowHelp}>Their login will be {shop.login_username??"shop"}.{username.trim().toLowerCase()||"anna"}</Text><Label>Starting password</Label><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters"/><Label>Quick role</Label><View style={s.stockSortRow}>{Object.entries(STAFF_PRESETS).map(([label,value])=><Chip key={label} label={label} selected={permissions.length===value.length&&value.every(x=>permissions.includes(x))} onPress={()=>setPermissions([...value])}/>)}</View><Label>Functions this person can use</Label>{permissionGrid(permissions,setPermissions)}<BigButton label={creating?"Creating account…":"Create staff account"} icon="person-add-outline" onPress={()=>void create()} disabled={creating}/></View>
    <Text style={s.section}>Staff accounts</Text>{loading?<ActivityIndicator color={C.green}/>:staff.length?staff.map(person=><View key={person.user_id} style={s.adminShop}><View style={s.adminShopTop}><View style={s.shopAvatar}><Ionicons name="person-outline" size={23} color={C.green}/></View><View style={s.flex}><Text style={s.rowTitle}>{person.display_name}</Text><Text style={s.rowHelp}>{person.login_username}</Text><Text style={s.adminLastLogin}>{person.last_login?`Last login: ${friendlyDateTime(person.last_login)}`:"No login yet"}</Text></View><View style={[s.statusPill,!person.active&&s.statusPillPaused]}><Text style={[s.statusText,!person.active&&s.statusTextPaused]}>{person.active?"ACTIVE":"DISABLED"}</Text></View></View><Text style={s.staffAccessSummary}>{person.permissions.map(id=>STAFF_PERMISSIONS.find(x=>x.id===id)?.label).filter(Boolean).join(" · ")}</Text><View style={[s.adminShopActions,width<620&&s.adminShopActionsMobile]}><Pressable style={[s.adminShopAction,width<620&&s.adminShopActionMobile]} onPress={()=>setEditing({...person,permissions:[...person.permissions]})}><Ionicons name="options-outline" size={20} color={C.green}/><Text style={s.adminShopActionText}>Access</Text></Pressable><Pressable style={[s.adminShopAction,width<620&&s.adminShopActionMobile]} onPress={()=>{setPasswordPerson(person);setNewPassword("");}}><Ionicons name="key-outline" size={20} color={C.accent}/><Text style={s.adminShopActionText}>Password</Text></Pressable><Pressable style={[s.adminShopAction,width<620&&s.adminShopActionMobile]} onPress={()=>setStatus(person)}><Ionicons name={person.active?"pause-circle-outline":"play-circle-outline"} size={20} color={person.active?C.red:C.green}/><Text style={s.adminShopActionText}>{person.active?"Disable":"Enable"}</Text></Pressable></View></View>):<Empty title="No staff accounts yet"/>}
    {editing?<View style={s.editCard}><Text style={s.editName}>Access for {editing.display_name}</Text>{permissionGrid(editing.permissions,value=>setEditing({...editing,permissions:value}))}<BigButton label="Save access" icon="checkmark-circle-outline" onPress={()=>void savePermissions()}/><Pressable style={s.cancel} onPress={()=>setEditing(null)}><Text style={s.help}>Cancel</Text></Pressable></View>:null}
    {passwordPerson?<View style={s.editCard}><Text style={s.editName}>New password for {passwordPerson.display_name}</Text><TextInput style={s.input} secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="At least 6 characters"/><BigButton label="Change password" icon="key-outline" onPress={()=>void resetPassword()}/><Pressable style={s.cancel} onPress={()=>setPasswordPerson(null)}><Text style={s.help}>Cancel</Text></Pressable></View>:null}
  </ScrollView></SafeAreaView>;
}

function ShopApp({
  session,
  adminBusiness,
  onAdminExit,
  deviceUserName="Owner",
  onChangeDeviceUser,
}: {
  session?: Session;
  adminBusiness?: AdminShop;
  onAdminExit?: () => void;
  deviceUserName?: string;
  onChangeDeviceUser?: () => void;
}) {
  const { width } = useWindowDimensions();
  const [screen, setScreen] = useState<Screen>("home");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [staffPermissions,setStaffPermissions]=useState<StaffPermission[]|null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saleInProgress, setSaleInProgress] = useState(false);
  const [updatesOpen,setUpdatesOpen]=useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [productsBackScreen, setProductsBackScreen] = useState<Screen>("more");
  const [priceListBackScreen, setPriceListBackScreen] = useState<Screen>("home");
  const [reportBackScreen,setReportBackScreen]=useState<Screen>("home");
  const loadData = useCallback(
    async (businessId: string, selectedLocationId: string) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const [{ data: pd }, { data: cd }, { data: sd }] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,business_id,name,regular_price,sale_price,image_url,variant_label,letters_required,low_stock_threshold,category_id,active,inventory_levels(quantity_on_hand,needs_stock_count,location_id),product_variants(id,name,price_override,active,variant_inventory_levels(quantity_on_hand,location_id)),alphabet_style:alphabet_styles!products_alphabet_style_id_fkey(id,name,alphabet_letter_inventory(letter,quantity_on_hand,needs_stock_count,location_id))",
          )
          .eq("business_id", businessId)
          .eq("active", true)
          .eq("inventory_levels.location_id", selectedLocationId)
          .eq("product_variants.active", true)
          .eq(
            "product_variants.variant_inventory_levels.location_id",
            selectedLocationId,
          )
          .order("name"),
        supabase
          .from("categories")
          .select("id,name")
          .eq("business_id", businessId)
          .eq("active", true)
          .order("sort_order"),
        supabase
          .from("sales")
          .select(
            "id,receipt_number,payment_method,total,status,created_at,payment_confirmed_at,payment_reference,sale_items(product_name,variant_name,selected_letters,quantity)",
          )
          .eq("location_id", selectedLocationId)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
      ]);
      setProducts(
        (pd ?? []).map((p: any) => {
          const variants = (p.product_variants ?? []).map((v: any) => ({
            ...v,
            quantity_on_hand:
              v.variant_inventory_levels?.[0]?.quantity_on_hand ?? 0,
          })) as ProductVariant[];
          return {
            ...p,
            variants,
            letters_required: p.letters_required ?? 0,
            alphabet_style: p.alphabet_style
              ? {
                  id: p.alphabet_style.id,
                  name: p.alphabet_style.name,
                  letters: (p.alphabet_style.alphabet_letter_inventory ?? [])
                    .map((letter: any) => ({
                      letter: letter.letter,
                      quantity_on_hand: letter.quantity_on_hand ?? 0,
                      needs_stock_count: letter.needs_stock_count ?? true,
                    }))
                    .sort((a: any, b: any) => a.letter.localeCompare(b.letter)),
                }
              : null,
            quantity_on_hand: variants.length
              ? variants.reduce((sum, v) => sum + v.quantity_on_hand, 0)
              : (p.inventory_levels?.[0]?.quantity_on_hand ?? 0),
            needs_stock_count: variants.length
              ? false
              : (p.inventory_levels?.[0]?.needs_stock_count ?? true),
          };
        }) as Product[],
      );
      setCategories((cd ?? []) as Category[]);
      setSales((sd ?? []) as Sale[]);
    },
    [],
  );
  const initialize = useCallback(async () => {
    setLoading(true);
    if (adminBusiness) {
      setProfile({ id: "platform-admin", display_name: "Owner" });
      const b = { id: adminBusiness.id, name: adminBusiness.name, logo_url: adminBusiness.logo_url, role: "owner" } as Business;
      setBusiness(b);
      const { data: ld } = await supabase.from("locations").select("id,business_id,name").eq("business_id", b.id).eq("active", true).order("name");
      const list = (ld ?? []) as Location[];
      const first = list[0]?.id ?? "";
      setLocations(list);
      setLocationId(first);
      if (first) await loadData(b.id, first);
      setNeedsSetup(false);
      setLoading(false);
      return;
    }
    if (!session) return;
    const [{ data: p }, { data: m }, { data: staffAccess }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,display_name")
        .eq("id", session.user.id)
        .maybeSingle(),
      supabase
        .from("business_memberships")
        .select("business_id,role,businesses(id,name,logo_url,login_username)")
        .eq("user_id", session.user.id),
      supabase.from("shop_staff_accounts").select("permissions,active").eq("user_id",session.user.id).maybeSingle(),
    ]);
    setStaffPermissions(staffAccess?.active ? (staffAccess.permissions as StaffPermission[]) : null);
    setProfile(p as Profile | null);
    const member: any = m?.[0];
    if (!member) {
      setNeedsSetup(true);
      setLoading(false);
      return;
    }
    const b = {
      id: member.business_id,
      name: member.businesses.name,
      logo_url: member.businesses.logo_url ?? null,
      login_username: member.businesses.login_username ?? null,
      role: member.role,
    } as Business;
    setBusiness(b);
    const { data: ld } = await supabase
      .from("locations")
      .select("id,business_id,name")
      .eq("business_id", b.id)
      .eq("active", true)
      .order("name");
    const list = (ld ?? []) as Location[];
    const first = list[0]?.id ?? "";
    setLocations(list);
    setLocationId(first);
    if (first) await loadData(b.id, first);
    setNeedsSetup(false);
    setLoading(false);
  }, [adminBusiness, loadData, session]);
  useEffect(() => {
    initialize();
  }, [initialize]);
  useEffect(() => {
    if (loading || needsSetup || !business) return;
    const key = `mik-guide-v1-${session?.user.id ?? "platform-admin"}`;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen !== "done") setGuideOpen(true);
      })
      .catch(() => setGuideOpen(true));
  }, [business, loading, needsSetup, session?.user.id]);
  const closeGuide = async () => {
    setGuideOpen(false);
    await AsyncStorage.setItem(`mik-guide-v1-${session?.user.id ?? "platform-admin"}`, "done").catch(
      () => undefined,
    );
  };
  useEffect(()=>{
    if(loading||needsSetup||!business)return;
    const key=`mik-daily-updates-2026-09-04-${business.id}-${localDateKey()}`;
    AsyncStorage.getItem(key).then(seen=>{if(seen!=="done")setUpdatesOpen(true);}).catch(()=>setUpdatesOpen(true));
  },[business,loading,needsSetup]);
  const closeUpdates=async()=>{
    setUpdatesOpen(false);
    if(business)await AsyncStorage.setItem(`mik-daily-updates-2026-09-04-${business.id}-${localDateKey()}`,"done").catch(()=>undefined);
  };
  if (loading)
    return (
      <SafeAreaView style={s.loading}>
        <ActivityIndicator size="large" color={C.green} />
        <Text style={s.help}>Opening your shop…</Text>
      </SafeAreaView>
    );
  if (needsSetup) return <NoShopProfile />;
  const role: Role = business?.role ?? "staff";
  const nav = role === "owner" ? ownerNav : ownerNav.filter((x) =>
    x.id === "home" ||
    (x.id === "sell_start" && staffPermissions?.includes("sell")) ||
    (x.id === "orders" && staffPermissions?.includes("orders")) ||
    (x.id === "stock_start" && staffPermissions?.includes("stock"))
  );
  const current = locations.find((x) => x.id === locationId);
  const reload = () =>
    business && locationId
      ? loadData(business.id, locationId)
      : Promise.resolve();
  const chooseLocation = async (id: string) => {
    setLocationId(id);
    setScreen("home");
    if (business) await loadData(business.id, id);
  };
  let body: ReactNode;
  if (screen === "home")
    body = (
      <QuickStart
        locationId={locationId}
        permissions={staffPermissions}
        onOpen={(next) => {
          if (next === "products") {
            setEditProductId(null);
            setProductsBackScreen("home");
          }
          if (next === "price_list") setPriceListBackScreen("home");
          if (next === "report_issue") setReportBackScreen("home");
          setScreen(next);
          if (next === "dashboard") void reload();
        }}
      />
    );
  else if (screen === "sale" || screen === "missed" || screen === "event_sale")
    body = (
      <SaleScreen
        key={`${locationId}-${screen}`}
        products={products}
        categories={categories}
        locationId={locationId}
        onSaved={reload}
        onPendingChange={setSaleInProgress}
        startPastSale={screen === "missed"}
        eventMode={screen === "event_sale"}
        onNavigate={setScreen}
      />
    );
  else if (screen === "dashboard")
    body = (
      <Dashboard
        products={products}
        sales={sales}
        onSell={() => setScreen("sale")}
        onPrintQueue={() => setScreen("print_queue")}
      />
    );
  else if (screen === "stock_start")
    body = <StockStart onOpen={(next) => {
      if (next === "products") {
        setEditProductId(null);
        setProductsBackScreen("stock_start");
      }
      if (next === "price_list") setPriceListBackScreen("stock_start");
      setScreen(next);
    }} />;
  else if (screen === "inventory" || screen === "alphabet_inventory")
    body = (
      <Inventory
        products={products}
        categories={categories}
        locationId={locationId}
        onSaved={reload}
        alphabetOnly={screen === "alphabet_inventory"}
        onBack={() => setScreen("stock_start")}
        onManageProducts={(productId) => {
          setEditProductId(productId ?? null);
          setProductsBackScreen("inventory");
          setScreen("products");
        }}
      />
    );
  else if (screen === "products")
    body = (
      <Products
        businessId={business!.id}
        locationId={locationId}
        products={products}
        categories={categories}
        initialProductId={editProductId}
        onSaved={reload}
        onBack={() => {
          setEditProductId(null);
          setScreen(productsBackScreen);
        }}
      />
    );
  else if (screen === "reports")
    body = (
      <View style={s.flex}>
        <Back title="Sales reports" onPress={() => setScreen("more")} />
        <ReportsScreen locationId={locationId} hideTitle />
      </View>
    );
  else if (screen === "report_issue")
    body = <ReportIssue businessId={business!.id} onBack={() => setScreen(reportBackScreen)} />;
  else if (screen === "sell_start")
    body = <SellStart businessId={business!.id} deviceUserName={deviceUserName} onOpen={setScreen} />;
  else if (screen === "print_queue")
    body = <PrintQueueScreen businessId={business!.id} locationId={locationId} onBack={() => setScreen("home")} onOpenOrders={() => setScreen("orders")} />;
  else if (screen === "price_calculator")
    body = <PrintPriceCalculator onBack={() => setScreen("home")} />;
  else if (screen === "correct")
    body = <ReportsScreen locationId={locationId} correctionMode onBack={() => setScreen("sell_start")} />;
  else if (screen === "shop")
    body = (
      <ShopProfile
        business={business!}
        onBack={() => setScreen("more")}
        onSaved={(logo_url) => setBusiness((current) => current ? { ...current, logo_url } : current)}
      />
    );
  else if (screen === "orders")
    body = <OrdersScreen businessId={business!.id} locationId={locationId} />;
  else if (screen === "printers")
    body = <PrintersScreen businessId={business!.id} locationId={locationId} onBack={() => setScreen("home")} />;
  else if (screen === "filaments")
    body = <FilamentsScreen businessId={business!.id} locationId={locationId} onBack={() => setScreen("home")} />;
  else if (screen === "calendar")
    body = <CalendarScreen businessId={business!.id} locationId={locationId} onBack={() => setScreen("home")} />;
  else if (screen === "price_list")
    body = (
      <PriceList
        products={products}
        categories={categories}
        business={business!}
        onBack={() => setScreen(priceListBackScreen)}
        onEdit={() => {
          setEditProductId(null);
          setProductsBackScreen("price_list");
          setScreen("products");
        }}
      />
    );
  else if(screen === "staff")
    body=<AdminStaffManager shop={{id:business!.id,name:business!.name,logo_url:business!.logo_url,slug:null,login_username:business!.login_username??null,status:"active",created_at:""}} onBack={()=>setScreen("more")}/>;
  else
    body = (
      <More
        profile={profile}
        business={business!}
        onOpen={(next) => {
          if (next === "products") {
            setEditProductId(null);
            setProductsBackScreen("more");
          }
          if (next === "price_list") setPriceListBackScreen("more");
          if (next === "report_issue") setReportBackScreen("more");
          setScreen(next);
        }}
        onGuide={() => setGuideOpen(true)}
        deviceUserName={deviceUserName}
        onChangeDeviceUser={onChangeDeviceUser}
        canManageStaff={role === "owner"}
      />
    );
  const selected =
    screen === "inventory" || screen === "alphabet_inventory" || screen === "products" || screen === "price_list"
      ? "stock_start"
      : screen === "reports" || screen === "shop" || screen === "report_issue" || screen === "staff"
      ? "more"
      : screen === "printers" || screen === "filaments" || screen === "calendar" || screen === "print_queue" || screen === "price_calculator"
        ? "home"
      : screen === "missed" || screen === "sale" || screen === "event_sale"
        ? "sell_start"
      : screen === "correct"
          ? "sell_start"
          : screen;
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.top}>
        {onAdminExit ? (
          <Pressable accessibilityLabel="Back to all shops" style={s.backButton} onPress={onAdminExit}>
            <Ionicons name="arrow-back" size={23} color={C.ink} />
          </Pressable>
        ) : null}
        <Image source={business?.logo_url ? { uri: business.logo_url } : require("../assets/mik-app-icon.png")} style={s.shopLogo} />
        <View style={s.flex}>
          <Text style={s.shopName} numberOfLines={1}>
            {business?.name}
          </Text>
          <Text style={s.locationName}>
            {(current?.name ?? "Shop location").toLowerCase().includes("sebu")
              ? "Pixelbug"
              : current?.name ?? "Shop location"}
          </Text>
        </View>
        {width < 900 ? <Pressable style={s.headerHome} onPress={() => setScreen("home")} accessibilityLabel="Go to home page" accessibilityRole="button">
          <Ionicons name="home" size={19} color={C.white} />
          <Text style={s.headerHomeText}>Home</Text>
        </Pressable> : null}
      </View>
      {locations.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.locationBar}
        >
          <Text style={s.locationLabel}>Shop:</Text>
          {locations.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              selected={locationId === l.id}
              onPress={() => chooseLocation(l.id)}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={[s.workspace,width>=900&&s.desktopWorkspace]}>
      <View style={[s.content,width>=900&&s.desktopContent]}>{body}</View>
      <View style={[s.nav,width>=900&&s.desktopNav]}>
        {nav.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.label}`}
            style={[s.navItem,width>=900&&s.desktopNavItem]}
            onPress={() => {
              const openScreen = () => {
                setScreen(item.id);
                if (item.id === "dashboard") void reload();
              };
              if ((screen === "sale" || screen === "missed" || screen === "event_sale") && saleInProgress && item.id !== "sale")
                confirmDestructive(
                  "Keep this unfinished sale?",
                  "Leaving now will clear the selected products.",
                  "Leave and clear",
                  () => { setSaleInProgress(false); openScreen(); },
                );
              else openScreen();
            }}
          >
            <View
              style={[
                s.navIcon,
                width>=900&&s.desktopNavIcon,
                {
                  backgroundColor: selected === item.id ? item.color : "transparent",
                },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={24}
                color={selected === item.id ? C.white : C.muted}
              />
            </View>
            <Text
              pointerEvents="none"
              style={[
                s.navText,
                selected === item.id && s.navTextOn,
                { color: selected === item.id ? item.color : C.muted },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      </View>
      {screen!=="report_issue"?<Pressable accessibilityRole="button" accessibilityLabel="Send an issue, feedback or change request to Esther" style={[s.floatingFeedback,width>=900&&s.floatingFeedbackDesktop]} onPress={()=>{setReportBackScreen(screen);setScreen("report_issue");}}><Ionicons name="chatbubble-ellipses-outline" size={20} color={C.white}/><Text style={s.floatingFeedbackText}>Help & feedback</Text></Pressable>:null}
      <GuideModal visible={guideOpen} onClose={closeGuide} />
      <WhatsNewModal visible={updatesOpen&&!guideOpen} onClose={closeUpdates}/>
    </SafeAreaView>
  );
}

function NoShopProfile() {
  return (
    <SafeAreaView style={s.login}>
      <View style={s.loginCard}>
        <View style={s.logo}>
          <Ionicons name="storefront" size={34} color={C.white} />
        </View>
        <Text style={s.loginTitle}>Your shop is not ready yet</Text>
        <Text style={s.centerHelp}>
          Ask the app administrator to create or connect your shop profile.
        </Text>
        <BigButton
          label="Sign out"
          icon="log-out-outline"
          onPress={() => supabase.auth.signOut()}
        />
      </View>
    </SafeAreaView>
  );
}

function SellStart({businessId,deviceUserName,onOpen}:{businessId:string;deviceUserName:string;onOpen:(screen:Screen)=>void}) {
  const today = localDateKey();
  const [welcomeVisible,setWelcomeVisible] = useState(false);
  const welcomeKey = `mik-sale-welcome-${businessId}-${today}`;
  useEffect(() => {
    AsyncStorage.getItem(welcomeKey)
      .then((seen) => setWelcomeVisible(seen !== "done"))
      .catch(() => setWelcomeVisible(true));
  }, [welcomeKey]);
  const closeWelcome = async () => {
    setWelcomeVisible(false);
    await AsyncStorage.setItem(welcomeKey,"done").catch(() => undefined);
  };
  const start = async (screen:Screen) => {
    await closeWelcome();
    onOpen(screen);
  };
  return <ScrollView contentContainerStyle={s.sellStartPage}>
    <Modal visible={welcomeVisible} transparent animationType="fade" onRequestClose={() => void closeWelcome()}>
      <SafeAreaView style={s.saleWelcomeOverlay}>
        <View style={s.saleWelcomeCard}>
          <View style={s.saleWelcomeIcon}><Ionicons name="sunny-outline" size={34} color={C.white}/></View>
          <Text style={s.saleWelcomeTitle}>{greetingForNow()}, {deviceUserName} 👋</Text>
          <Text style={s.saleWelcomeDate}>{friendlyLocalDate(today)}</Text>
          <Text style={s.saleWelcomeHelp}>Sales entered now will be recorded under today.</Text>
          <Pressable accessibilityRole="button" style={s.saleWelcomePrimary} onPress={() => void start("sale")}><Ionicons name="storefront" size={22} color={C.white}/><View style={s.flex}><Text style={s.saleWelcomePrimaryText}>Shop Sale</Text><Text style={s.saleWelcomePrimaryHelp}>Normal Checkout</Text></View></Pressable>
          <Pressable accessibilityRole="button" style={s.saleWelcomeSecondary} onPress={() => void start("event_sale")}><Ionicons name="flash" size={22} color={C.accent}/><View style={s.flex}><Text style={s.saleWelcomeSecondaryText}>Start Event Sale · Fast checkout</Text><Text style={s.saleWelcomeSecondaryHelp}>Skip letter choices now. Count A–Z keycaps after the event.</Text></View></Pressable>
          <Pressable accessibilityRole="button" style={s.saleWelcomeLater} onPress={() => void closeWelcome()}><Text style={s.saleWelcomeLaterText}>Choose later</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
    <View style={s.sellTodayCard}><Ionicons name="calendar-outline" size={22} color={C.green}/><View style={s.flex}><Text style={s.sellTodayLabel}>RECORDING FOR TODAY</Text><Text style={s.sellTodayDate}>{friendlyLocalDate(today)}</Text></View></View>
    <Text style={s.pageTitle}>How are you selling?</Text>
    <Text style={s.subtitle}>Choose one to start.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Shop Sale. Normal Checkout." style={[s.sellModeCard,{backgroundColor:SECTION.sales.soft}]} onPress={()=>onOpen("sale")}><View pointerEvents="none" style={[s.sellModeIcon,{backgroundColor:SECTION.sales.color}]}><Ionicons name="storefront" size={30} color={C.white}/></View><View pointerEvents="none" style={s.flex}><Text style={s.sellModeTitle}>Shop Sale</Text><Text style={s.sellModeHelp}>Normal Checkout</Text></View><Ionicons pointerEvents="none" name="arrow-forward" size={23} color={SECTION.sales.color}/></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Event Sale. Fast checkout. Letter selection is skipped." style={[s.sellModeCard,{backgroundColor:SECTION.production.soft}]} onPress={()=>onOpen("event_sale")}><View pointerEvents="none" style={[s.sellModeIcon,{backgroundColor:SECTION.production.color}]}><Ionicons name="flash" size={30} color={C.white}/></View><View pointerEvents="none" style={s.flex}><Text style={s.sellModeTitle}>Event Sale</Text><Text style={s.sellModeHelp}>Fast Checkout</Text></View><Ionicons pointerEvents="none" name="arrow-forward" size={23} color={SECTION.production.color}/></Pressable>
    <View style={s.eventModeNote}><Ionicons name="information-circle-outline" size={22} color={C.accent}/><View style={s.flex}><Text style={s.eventModeNoteStrong}>How Event Sale works</Text><Text style={s.eventModeStep}>1. Add the product and take payment.</Text><Text style={s.eventModeStep}>2. Clickers skip the letter screen.</Text><Text style={s.eventModeStep}>3. After the event, count the A–Z keycaps left.</Text><Text style={s.eventModeTip}>Tip: Take a photo of sold items to help you count later.</Text></View></View>
    <Text style={s.salesRecordHeading}>CORRECT A MISTAKE</Text>
    <Text style={s.salesRecordHelp}>Use this when a sale was entered incorrectly.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel wrong sale. Find a sale entered by mistake and cancel it." style={s.earlierSale} onPress={()=>onOpen("correct")}><Ionicons pointerEvents="none" name="return-up-back-outline" size={21} color={SECTION.records.color}/><View pointerEvents="none" style={s.flex}><Text style={s.earlierSaleTitle}>Cancel wrong sale</Text><Text style={s.earlierSaleHelp}>Find a mistaken sale and cancel it</Text></View><Ionicons pointerEvents="none" name="chevron-forward" size={20} color={C.muted}/></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Forgot to enter a sale? Add it now using the actual earlier date." style={s.missedSaleFeature} onPress={()=>onOpen("missed")}><View pointerEvents="none" style={s.missedSaleFeatureIcon}><Ionicons name="calendar-number-outline" size={27} color={C.white}/></View><View pointerEvents="none" style={s.flex}><Text style={s.missedSaleFeatureTitle}>Forgot to enter a sale?</Text><Text style={s.missedSaleFeatureHelp}>Choose the date, products and price charged then.</Text><Text style={s.missedSaleFeatureAction}>ADD AN EARLIER SALE</Text></View><Ionicons pointerEvents="none" name="arrow-forward" size={23} color={SECTION.records.color}/></Pressable>
  </ScrollView>;
}

function StockStart({onOpen}:{onOpen:(screen:Screen)=>void}) {
  return <ScrollView contentContainerStyle={s.sellStartPage}>
    <Text style={s.pageTitle}>Stock</Text>
    <Text style={s.subtitle}>Choose what you want to do. Mik will guide you one step at a time.</Text>
    <View style={[s.flowGuide,{backgroundColor:SECTION.stock.soft,borderColor:SECTION.stock.border}]}>
      <View style={[s.flowGuideNumber,{backgroundColor:SECTION.stock.color}]}><Text style={s.flowGuideNumberText}>1</Text></View>
      <View style={s.flex}><Text style={s.flowGuideTitle}>Start here</Text><Text style={s.flowGuideText}>Choose a card below. Nothing changes until you press the final save button.</Text></View>
    </View>
    <Pressable style={[s.sellModeCard,{backgroundColor:SECTION.stock.soft,borderColor:SECTION.stock.border}]} onPress={()=>onOpen("inventory")}><View style={[s.sellModeIcon,{backgroundColor:SECTION.stock.color}]}><Ionicons name="cube" size={29} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Check or update stock</Text><Text style={s.sellModeHelp}>See what is low, add stock or correct the number</Text></View><Ionicons name="arrow-forward" size={23} color={SECTION.stock.color}/></Pressable>
    <Pressable style={[s.sellModeCard,{backgroundColor:SECTION.stock.soft,borderColor:SECTION.stock.border}]} onPress={()=>onOpen("alphabet_inventory")}><View style={[s.sellModeIcon,{backgroundColor:SECTION.stock.color}]}><Ionicons name="text" size={29} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Update A–Z letters</Text><Text style={s.sellModeHelp}>Only keycap designs and their A–Z stock appear here</Text></View><Ionicons name="arrow-forward" size={23} color={SECTION.stock.color}/></Pressable>
    <Pressable style={[s.sellModeCard,{backgroundColor:SECTION.stock.soft,borderColor:SECTION.stock.border}]} onPress={()=>onOpen("products")}><View style={[s.sellModeIcon,{backgroundColor:SECTION.stock.color}]}><Ionicons name="cube-outline" size={29} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Manage products</Text><Text style={s.sellModeHelp}>Add, edit or delete products and categories</Text></View><Ionicons name="arrow-forward" size={23} color={SECTION.stock.color}/></Pressable>
    <Pressable style={[s.sellModeCard,{backgroundColor:SECTION.stock.soft,borderColor:SECTION.stock.border}]} onPress={()=>onOpen("price_list")}><View style={[s.sellModeIcon,{backgroundColor:SECTION.stock.color}]}><Ionicons name="receipt-outline" size={29} color={C.white}/></View><View style={s.flex}><Text style={s.sellModeTitle}>Price list</Text><Text style={s.sellModeHelp}>See or print the prices shown to customers</Text></View><Ionicons name="arrow-forward" size={23} color={SECTION.stock.color}/></Pressable>
  </ScrollView>;
}

function PastSaleDatePicker({ value, onChange, onBack, onContinue }: { value: string; onChange: (value: string) => void; onBack: () => void; onContinue: () => void }) {
  const selected = new Date(`${value}T12:00:00`);
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const today = localDateKey();
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const canGoNext = nextMonth <= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const chooseQuickDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    onChange(localDateKey(date));
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };
  return (
    <ScrollView contentContainerStyle={s.pastDatePage}>
      <Back title="Add missed sale" onPress={onBack} />
      <Text style={s.pageTitle}>When was the sale?</Text>
      <Text style={s.subtitle}>Choose the original sale date before adding products.</Text>
      <View style={s.pastQuickDates}>
        <Pressable style={s.pastQuickDate} onPress={() => chooseQuickDate(1)}><Text style={s.pastQuickDateText}>Yesterday</Text></Pressable>
        <Pressable style={s.pastQuickDate} onPress={() => chooseQuickDate(2)}><Text style={s.pastQuickDateText}>2 days ago</Text></Pressable>
        <Pressable style={s.pastQuickDate} onPress={() => chooseQuickDate(7)}><Text style={s.pastQuickDateText}>1 week ago</Text></Pressable>
      </View>
      <View style={s.pastCalendar}>
        <View style={s.pastCalendarTop}>
          <Pressable accessibilityLabel="Previous month" style={s.pastMonthButton} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
          <Text style={s.pastMonthTitle}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
          <Pressable accessibilityLabel="Next month" disabled={!canGoNext} style={[s.pastMonthButton,!canGoNext&&{opacity:.3}]} onPress={() => canGoNext && setMonth(nextMonth)}><Ionicons name="chevron-forward" size={22} color={C.ink} /></Pressable>
        </View>
        <View style={s.pastWeekRow}>{["S","M","T","W","T","F","S"].map((day,index)=><Text key={`${day}-${index}`} style={s.pastWeekDay}>{day}</Text>)}</View>
        <View style={s.pastDays}>
          {days.map((day) => {
            const key = localDateKey(day);
            const disabled = key > today || day.getFullYear() < 2020;
            const active = key === value;
            const outside = day.getMonth() !== month.getMonth();
            return <Pressable key={key} disabled={disabled} accessibilityLabel={friendlyLocalDate(key)} style={[s.pastDay,active&&s.pastDayOn]} onPress={() => onChange(key)}><Text style={[s.pastDayText,outside&&s.pastDayOutside,disabled&&s.pastDayDisabled,active&&s.pastDayTextOn]}>{day.getDate()}</Text></Pressable>;
          })}
        </View>
      </View>
      <View style={s.pastDateSelected}><Ionicons name="calendar" size={22} color={SECTION.records.color}/><View style={s.flex}><Text style={s.pastDateSelectedLabel}>SALE DATE</Text><Text style={s.pastDateSelectedValue}>{friendlyLocalDate(value)}</Text></View></View>
      <BigButton label="Continue to products" icon="arrow-forward" color={SECTION.records.color} onPress={onContinue} />
    </ScrollView>
  );
}

function SaleScreen({
  products,
  categories,
  locationId,
  onSaved,
  onPendingChange,
  startPastSale = false,
  eventMode = false,
  onNavigate,
}: {
  products: Product[];
  categories: Category[];
  locationId: string;
  onSaved: () => void;
  onPendingChange: (pending: boolean) => void;
  startPastSale?: boolean;
  eventMode?: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  const { width } = useWindowDimensions();
  const productColumns = width >= 980 ? 4 : width >= 700 ? 3 : 2;
  const [category, setCategory] = useState<string | null>(null);
  const [saleCategoryOpen, setSaleCategoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [choosing, setChoosing] = useState<Product | null>(null);
  const [chosenLetters, setChosenLetters] = useState<string[]>([]);
  const [chosenDesign, setChosenDesign] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [gcashReceived, setGcashReceived] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordPastSale, setRecordPastSale] = useState(startPastSale);
  const [pastSaleDate, setPastSaleDate] = useState(() => localDateKey());
  const [pastDateReady, setPastDateReady] = useState(!startPastSale);
  useEffect(() => onPendingChange(cart.length > 0), [cart.length, onPendingChange]);
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const filtered = products.filter(
    (p) =>
      (!category || p.category_id === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const choosingCategory = category === null && search.trim() === "";
  const saleContentWidth = Math.min(width, 1180) - (width >= 900 ? 56 : 36);
  const cardWidth =
    (saleContentWidth - (productColumns - 1) * 11) / productColumns;
  const total = cart.reduce((n, x) => n + x.quantity * x.unitPrice, 0);
  const cashAmount = Number(cashReceived);
  const cashIsEnough =
    recordPastSale || payment !== "cash" ||
    (cashReceived.trim() !== "" && Number.isFinite(cashAmount) && cashAmount >= total);
  const changeDue = payment === "cash" && cashIsEnough ? cashAmount - total : 0;
  const count = cart.reduce((n, x) => n + x.quantity, 0);
  const cartKey = (
    productId: string,
    variantId?: string | null,
    letters: string[] = [],
  ) => `${productId}:${variantId ?? "main"}:${letters.join("")}`;
  const add = (
    p: Product,
    variant: ProductVariant | null = null,
    selectedLetters: string[] = [],
  ) => {
    if (!eventMode && p.letters_required > 0 && selectedLetters.length !== p.letters_required) {
      setChoosing(p);
      setChosenLetters([]);
      return;
    }
    if (p.variants.length && !variant) {
      setChoosing(p);
      return;
    }
    const price = variant?.price_override ?? p.sale_price ?? p.regular_price;
    const available = variant?.quantity_on_hand ?? p.quantity_on_hand;
    if (price === null)
      return Alert.alert("No price yet", "Ask the owner to add a price first.");
    if (available < 1)
      return Alert.alert(
        "Out of stock",
        "There are no items available to sell.",
      );
    const key = cartKey(p.id, variant?.id, selectedLetters);
    setCart((old) => {
      const found = old.find(
        (x) => cartKey(x.product.id, x.variant?.id, x.selectedLetters) === key,
      );
      if (found)
        return found.quantity >= available
          ? old
          : old.map((x) =>
              cartKey(x.product.id, x.variant?.id, x.selectedLetters) === key
                ? { ...x, quantity: x.quantity + 1 }
                : x,
            );
      return [
        ...old,
        { product: p, variant, selectedLetters, quantity: 1, unitPrice: price, listedPrice: price },
      ];
    });
    setChoosing(null);
    setChosenLetters([]);
    setChosenDesign(null);
  };
  const change = (key: string, n: number) =>
    setCart((old) =>
      old.flatMap((x) => {
        if (cartKey(x.product.id, x.variant?.id, x.selectedLetters) !== key)
          return [x];
        if (x.quantity + n <= 0) return [];
        const normalStock = x.variant?.quantity_on_hand ?? x.product.quantity_on_hand;
        const selectedLetterCounts = x.selectedLetters.reduce<Record<string, number>>(
          (counts, letter) => ({ ...counts, [letter]: (counts[letter] ?? 0) + 1 }),
          {},
        );
        const letterStock = x.selectedLetters.length
          ? Math.min(
              ...Object.entries(selectedLetterCounts).map(([letter, needed]) =>
                Math.floor(
                  (x.product.alphabet_style?.letters.find((item) => item.letter === letter)
                    ?.quantity_on_hand ?? 0) / needed,
                ),
              ),
            )
          : normalStock;
        const available = Math.min(normalStock, letterStock);
        if (n > 0 && x.quantity >= available) {
          Alert.alert(
            "Not enough letter stock",
            x.selectedLetters.length
              ? `Only ${available} matching set${available === 1 ? " is" : "s are"} available for ${x.selectedLetters.join(" · ")}. To sell another clicker with different letters, return to Sell and select the product again.`
              : `Only ${available} unit${available === 1 ? " is" : "s are"} available.`,
          );
          return [x];
        }
        return [{ ...x, quantity: Math.min(available, x.quantity + n) }];
      }),
    );
  const changePastPrice = (key: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (cleaned.split(".").length > 2) return;
    const price = Number(cleaned);
    setCart((old) => old.map((item) =>
      cartKey(item.product.id, item.variant?.id, item.selectedLetters) === key
        ? { ...item, unitPrice: cleaned === "" || !Number.isFinite(price) ? 0 : price }
        : item,
    ));
  };
  const complete = async () => {
    if (!cart.length) return;
    if (recordPastSale && !/^\d{4}-\d{2}-\d{2}$/.test(pastSaleDate))
      return Alert.alert("Check the sale date", "Choose the original sale date before continuing.");
    if (recordPastSale && cart.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0))
      return Alert.alert("Price needed", "Enter the price charged for every product in this earlier sale.");
    if (!recordPastSale && payment === "cash" && !cashIsEnough)
      return Alert.alert(
        "Not enough cash",
        `The customer still needs to give ${peso(Math.max(0, total - (Number.isFinite(cashAmount) ? cashAmount : 0)))}.`,
      );
    if (!recordPastSale && payment === "gcash" && !gcashReceived)
      return Alert.alert(
        "Check GCash first",
        "Confirm that the payment appeared in the shop’s GCash account.",
      );
    const savedForDate = recordPastSale ? pastSaleDate : localDateKey();
    setSaving(true);
    const saleParams = {
        p_location_id: locationId,
        p_items: cart.map((x) => ({
          product_id: x.product.id,
          variant_id: x.variant?.id ?? null,
          selected_letters: x.selectedLetters,
          defer_letters: eventMode && x.product.letters_required > 0,
          quantity: x.quantity,
          ...(recordPastSale ? { unit_price: x.unitPrice } : {}),
        })),
        p_payment_method: payment,
        p_payment_received: recordPastSale || payment === "cash" || gcashReceived,
        p_payment_reference:
          payment === "gcash" ? paymentReference.trim() : null,
      };
    const { data, error } = eventMode
      ? await supabase.rpc("create_event_sale", saleParams)
      : recordPastSale
      ? await supabase.rpc("create_backdated_sale_with_choices", {
          ...saleParams,
          p_sale_date: pastSaleDate,
        })
      : await supabase.rpc("create_confirmed_sale_with_choices", saleParams);
    if (error) {
      setSaving(false);
      return Alert.alert(
        "Sale not saved",
        error.message.includes("date")
          ? error.message
          : "Please check the stock and try again.",
      );
    }
    const { data: saved } = await supabase
      .from("sales")
      .select("receipt_number,total")
      .eq("id", data)
      .single();
    setSaving(false);
    setCart([]);
    setReview(false);
    setPayment("cash");
    setGcashReceived(false);
    setPaymentReference("");
    setCashReceived("");
    setRecordPastSale(false);
    setPastSaleDate(localDateKey());
    await onSaved();
    Alert.alert(
      "Sale completed",
      `Saved for ${friendlyLocalDate(savedForDate)}\nReceipt ${saved?.receipt_number ?? ""}\n${peso(Number(saved?.total ?? total))} paid by ${payment === "cash" ? recordPastSale ? "Cash" : `Cash\nChange: ${peso(changeDue)}` : recordPastSale ? "GCash" : "GCash received"}.`,
      recordPastSale
        ? [
            { text: "Done", onPress: () => onNavigate("sell_start") },
            { text: "Add another earlier sale", onPress: () => { setRecordPastSale(true); setPastDateReady(false); } },
          ]
        : [
            { text: eventMode ? "See event sales" : "See sales today", onPress: () => onNavigate("dashboard") },
            { text: eventMode ? "Next sale" : "Start next sale", onPress: () => onNavigate(eventMode ? "event_sale" : "sale") },
          ],
    );
  };
  if (recordPastSale && !pastDateReady)
    return (
      <PastSaleDatePicker
        value={pastSaleDate}
        onChange={setPastSaleDate}
        onBack={() => onNavigate("sell_start")}
        onContinue={() => setPastDateReady(true)}
      />
    );
  if (review)
    return (
      <View style={s.flex}>
        <Back title="Review sale" onPress={() => setReview(false)} />
        <ScrollView contentContainerStyle={s.scroll}>
          <Step number="2">Check quantity, then choose payment.</Step>
          {cart.map((x) => {
            const key = cartKey(
              x.product.id,
              x.variant?.id,
              x.selectedLetters,
            );
            return (
              <View key={key} style={s.cartRow}>
                <View style={s.cartProductTop}>
                  {x.product.image_url ? (
                    <Image
                      source={{ uri: x.product.image_url }}
                      style={s.miniProductImage}
                    />
                  ) : (
                    <View style={s.miniMissingPhoto}>
                      <Text style={s.miniMissingText}>NO PHOTO</Text>
                    </View>
                  )}
                  <View style={s.flex}>
                    <Text style={s.rowTitle} numberOfLines={2}>{x.product.name}</Text>
                    {x.variant ? (
                      <Text style={s.variantChosen} numberOfLines={1}>
                        {x.product.variant_label ?? "Choice"}: {x.variant.name}
                      </Text>
                    ) : null}
                    {x.selectedLetters.length ? (
                      <Text style={s.variantChosen} numberOfLines={1}>
                        {x.product.alphabet_style?.name ?? "Letters"}: {x.selectedLetters.join(" · ")}
                      </Text>
                    ) : null}
                    {recordPastSale ? (
                      <View style={s.pastPriceField}>
                        <Text style={s.pastPriceLabel}>Which price was charged?</Text>
                        <Pressable
                          style={[s.currentPriceButton, x.unitPrice === x.listedPrice && s.currentPriceButtonOn]}
                          onPress={() => changePastPrice(key, String(x.listedPrice))}
                        >
                          <Ionicons name={x.unitPrice === x.listedPrice ? "checkmark-circle" : "refresh-circle-outline"} size={20} color={x.unitPrice === x.listedPrice ? C.white : SECTION.records.color}/>
                          <Text style={[s.currentPriceButtonText, x.unitPrice === x.listedPrice && s.currentPriceButtonTextOn]}>Use current price · {peso(x.listedPrice)}</Text>
                        </Pressable>
                        <Text style={s.pastPriceOr}>OR ENTER THE PRICE CHARGED THEN</Text>
                        <View style={s.pastPriceInputWrap}>
                          <Text style={s.pastPricePeso}>₱</Text>
                          <TextInput
                            accessibilityLabel={`Price charged for ${x.product.name}`}
                            style={s.pastPriceInput}
                            value={x.unitPrice > 0 ? String(x.unitPrice) : ""}
                            onChangeText={(value) => changePastPrice(key, value)}
                            placeholder="0"
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <Text style={s.pastPriceHint}>Only change this when the earlier selling price was different.</Text>
                      </View>
                    ) : <Text style={s.rowHelp}>{peso(x.unitPrice)} each</Text>}
                  </View>
                  <Text style={s.lineTotal}>
                    {peso(x.quantity * x.unitPrice)}
                  </Text>
                </View>
                <View style={s.cartProductBottom}>
                  <Text style={s.quantityLabel}>Quantity</Text>
                  <Quantity
                    value={x.quantity}
                    minus={() => change(key, -1)}
                    plus={() => change(key, 1)}
                  />
                </View>
              </View>
            );
          })}
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Amount to collect</Text>
            <Text style={s.totalValue}>{peso(total)}</Text>
          </View>
          <Text style={s.section}>How did the customer pay?</Text>
          <View style={s.choiceRow}>
            <Choice
              label="Cash"
              icon="cash-outline"
              selected={payment === "cash"}
              onPress={() => {
                setPayment("cash");
                setGcashReceived(false);
                setPaymentReference("");
              }}
            />
            <Choice
              label="GCash"
              icon="phone-portrait-outline"
              selected={payment === "gcash"}
              onPress={() => {
                setPayment("gcash");
                setCashReceived("");
              }}
            />
          </View>
          {payment === "cash" && !recordPastSale ? (
            <View style={s.cashCalculator}>
              <View style={s.gcashHeading}>
                <View style={s.cashIcon}>
                  <Ionicons name="cash-outline" size={27} color={C.accent} />
                </View>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Cash received</Text>
                  <Text style={s.rowHelp}>Enter how much the customer gave you.</Text>
                </View>
              </View>
              <TextInput
                accessibilityLabel="Cash received"
                style={s.cashInput}
                value={cashReceived}
                onChangeText={setCashReceived}
                placeholder="₱0"
                keyboardType="decimal-pad"
              />
              <View style={s.quickCashRow}>
                {[100, 200, 500, 1000].map((amount) => (
                  <Pressable key={amount} style={s.quickCash} onPress={() => setCashReceived(String(amount))}>
                    <Text style={s.quickCashText}>₱{amount}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={[s.changeBox, cashReceived.trim() !== "" && !cashIsEnough && s.changeBoxShort]}>
                <Text style={s.totalLabel}>
                  {cashReceived.trim() === ""
                    ? "Change to give"
                    : cashIsEnough
                      ? "CHANGE TO GIVE"
                      : "MORE CASH NEEDED"}
                </Text>
                <Text style={s.changeValue}>
                  {cashReceived.trim() === ""
                    ? "Enter cash"
                    : cashIsEnough
                      ? peso(changeDue)
                      : peso(Math.max(0, total - (Number.isFinite(cashAmount) ? cashAmount : 0)))}
                </Text>
              </View>
            </View>
          ) : null}
          {payment === "gcash" && !recordPastSale ? (
            <View style={s.gcashCheck}>
              <View style={s.gcashHeading}>
                <View style={s.gcashIcon}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={27}
                    color={C.green}
                  />
                </View>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Check the shop’s GCash</Text>
                  <Text style={s.rowHelp}>
                    Only confirm after the payment appears.
                  </Text>
                </View>
              </View>
              <Pressable
                style={[s.receivedButton, gcashReceived && s.receivedButtonOn]}
                onPress={() => setGcashReceived((value) => !value)}
              >
                <Ionicons
                  name={gcashReceived ? "checkmark-circle" : "ellipse-outline"}
                  size={26}
                  color={gcashReceived ? C.white : C.green}
                />
                <Text
                  style={[s.receivedText, gcashReceived && s.receivedTextOn]}
                >
                  {gcashReceived
                    ? "Payment received"
                    : "I confirm payment was received"}
                </Text>
              </Pressable>
              <Label>GCash reference (optional)</Label>
              <TextInput
                style={s.input}
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Example: last 6 digits"
                keyboardType="number-pad"
              />
            </View>
          ) : null}
          {recordPastSale ? (
            <View style={s.pastSaleSummary}>
              <View style={s.pastSaleIcon}><Ionicons name="calendar-outline" size={22} color={C.dark} /></View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>Save to {friendlyLocalDate(pastSaleDate)}</Text>
                <Text style={s.rowHelp}>The selected date, price charged and payment type will be recorded.</Text>
              </View>
              <Pressable style={s.changePastDateButton} onPress={() => { setReview(false); setPastDateReady(false); }}><Text style={s.changePastDateText}>Change date</Text></Pressable>
            </View>
          ) : null}
          <BigButton
            label={
              saving
                ? "Saving sale…"
                : !recordPastSale && payment === "gcash" && !gcashReceived
                  ? "Confirm GCash payment above"
                  : !recordPastSale && payment === "cash" && !cashIsEnough
                    ? "Enter cash received"
                  : `${recordPastSale ? "Record past sale" : "Complete sale"} · ${peso(total)}`
            }
            icon="checkmark-circle-outline"
            onPress={complete}
            disabled={
              saving ||
              !cart.length ||
              (!recordPastSale && payment === "gcash" && !gcashReceived) ||
              (!recordPastSale && payment === "cash" && !cashIsEnough) ||
              (recordPastSale && (!/^\d{4}-\d{2}-\d{2}$/.test(pastSaleDate) || cart.some((item) => item.unitPrice <= 0)))
            }
          />
          <Text style={s.safe}>
            Stock changes only after you complete the sale.
          </Text>
        </ScrollView>
      </View>
    );
  return (
    <View style={s.flex}>
      <FlatList
        key={`products-${productColumns}`}
        data={choosingCategory ? [] : filtered}
        numColumns={productColumns}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={s.productRow}
        contentContainerStyle={[
          s.productList,
          count > 0 && s.productListBasket,
        ]}
        ListHeaderComponent={
          <>
            {!startPastSale ? (
              <View style={s.saleDateBar}>
                <Ionicons name="calendar-outline" size={20} color={C.green} />
                <View style={s.flex}><Text style={s.saleDateBarLabel}>{eventMode ? "EVENT SALE · RECORDING FOR TODAY" : "SHOP SALE · RECORDING FOR TODAY"}</Text><Text style={s.saleDateBarValue}>{friendlyLocalDate()}</Text></View>
              </View>
            ) : null}
            {startPastSale ? (
              <View style={s.missedBanner}>
                <Ionicons name="calendar" size={24} color={C.white} />
                <View style={s.flex}>
                  <Text style={s.missedBannerTitle}>Adding a missed sale</Text>
                  <Text style={s.missedBannerText}>Choose the products now. You will choose the original date before saving.</Text>
                </View>
              </View>
            ) : null}
            {eventMode ? (
              <View style={s.eventBanner}>
                <Ionicons name="flash" size={22} color={C.accent} />
                <View style={s.flex}>
                  <Text style={s.eventBannerTitle}>Event mode: fast checkout</Text>
                  <Text style={s.eventBannerText}>
                    Tap the clicker and choose how many. No letters are selected now. The clicker base stock updates after payment. Count the remaining A–Z keycaps after the event, and take a photo of sold items to help with counting.
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={s.saleTitleRow}>
              <Text style={[s.pageTitle, s.flex]}>
                {choosingCategory ? "Choose a category" : "Choose a product"}
              </Text>
              {count > 0 ? (
                <Pressable
                  accessibilityLabel="Clear this sale"
                  style={s.clearSaleButton}
                  onPress={() => confirmDestructive(
                    "Clear this sale?",
                    "All selected products will be removed.",
                    "Clear sale",
                    () => {
                      setCart([]);
                      setChoosing(null);
                      setChosenLetters([]);
                      setChosenDesign(null);
                      setReview(false);
                      setCashReceived("");
                      setGcashReceived(false);
                      setPaymentReference("");
                    },
                  )}
                >
                  <Ionicons name="close-circle-outline" size={20} color={C.red} />
                  <Text style={s.clearSaleText}>Clear sale</Text>
                </Pressable>
              ) : null}
            </View>
            <Step number="1">
              {choosingCategory
                ? "Tap the type of product the customer wants."
                : "Tap a product photo to add it."}
            </Step>
            <Search value={search} onChange={setSearch} />
            {choosingCategory ? (
              <View style={s.categoryGrid}>
                {categories.map((c) => {
                  const tone = categoryTone(c.name);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${c.name}`}
                      key={c.id}
                      style={[
                        s.categoryCard,
                        {
                          backgroundColor: tone.soft,
                          borderColor: `${tone.color}26`,
                          width: width >= 980 ? "23.5%" : width >= 700 ? "31.8%" : "48%",
                          minHeight: width >= 700 ? 148 : 126,
                        },
                      ]}
                      onPress={() => setCategory(c.id)}
                    >
                      <View style={[s.categoryCardIcon, { backgroundColor: tone.color }]}>
                        <Ionicons name={categoryIcon(c.name)} size={28} color={C.white} />
                      </View>
                      <Text style={[s.categoryCardText, { color: tone.color }]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              width < 700 ? (
                <>
                  <Text style={s.stockFilterLabel}>Category</Text>
                  <Pressable style={s.stockCategoryPicker} onPress={() => setSaleCategoryOpen((open) => !open)}>
                    <View style={s.stockCategoryPickerIcon}>
                      <Ionicons name={category ? categoryIcon(categoryName(category)) : "apps"} size={21} color={C.accent} />
                    </View>
                    <Text style={s.stockCategoryPickerText} numberOfLines={1}>{category ? categoryName(category) : "All categories"}</Text>
                    <Text style={s.stockCategoryChange}>Change</Text>
                    <Ionicons name={saleCategoryOpen ? "chevron-up" : "chevron-down"} size={20} color={C.muted} />
                  </Pressable>
                  {saleCategoryOpen ? (
                    <View style={s.categoryMenu}>
                      <Pressable style={s.categoryMenuRow} onPress={() => { setCategory(null); setSearch(""); setSaleCategoryOpen(false); }}><Ionicons name="apps" size={20} color={C.ink}/><Text style={s.categoryMenuText}>All categories</Text></Pressable>
                      {categories.map((c) => (
                        <Pressable key={c.id} style={[s.categoryMenuRow,category===c.id&&s.categoryMenuRowOn]} onPress={() => { setCategory(c.id); setSaleCategoryOpen(false); }}><Ionicons name={categoryIcon(c.name)} size={20} color={categoryTone(c.name).color}/><Text style={s.categoryMenuText}>{c.name}</Text>{category===c.id?<Ionicons name="checkmark" size={20} color={C.accent}/>:null}</Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={s.desktopCategoryTabs}>
                  <Chip label="Categories" icon="grid" selected={false} onPress={() => { setCategory(null); setSearch(""); }} />
                  {categories.map((c) => (
                    <Chip key={c.id} label={c.name} icon={categoryIcon(c.name)} tone={categoryTone(c.name)} selected={category === c.id} onPress={() => setCategory(c.id)} />
                  ))}
                </View>
              )
            )}
          </>
        }
        ListEmptyComponent={choosingCategory ? null : <Empty title="Nothing here yet" />}
        renderItem={({ item }) => {
          const variantPrices = item.variants
            .map((variant) => variant.price_override)
            .filter((value): value is number => value !== null);
          const price =
            item.sale_price ??
            item.regular_price ??
            (variantPrices.length ? Math.min(...variantPrices) : null);
          const qty = cart
            .filter((x) => x.product.id === item.id)
            .reduce((sum, x) => sum + x.quantity, 0);
          const unavailable = item.quantity_on_hand <= 0 || price === null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.name}, ${price === null ? "no price" : peso(price)}`}
              style={[
                s.productCard,
                { width: cardWidth },
                unavailable && s.disabled,
                qty > 0 && s.productOn,
              ]}
              onPress={() => add(item)}
            >
              <View
                style={[
                  s.productVisual,
                  { height: cardWidth - 18 },
                ]}
              >
                {item.image_url || placeholderImage(item.name) ? (
                  <Image
                    source={item.image_url ? { uri: item.image_url } : placeholderImage(item.name)}
                    style={s.productCardImage}
                  />
                ) : (
                  <View style={s.missingPhoto}>
                    <Text style={s.missingPhotoText}>PHOTO NEEDED</Text>
                  </View>
                )}
                {qty > 0 ? (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{qty}</Text>
                  </View>
                ) : null}
                {item.sale_price !== null ? (
                  <View style={s.saleBadge}>
                    <Text style={s.saleBadgeText}>ON SALE</Text>
                  </View>
                ) : null}
                <View
                  style={[
                    s.stockBadge,
                    item.quantity_on_hand <= item.low_stock_threshold && s.stockBadgeLow,
                  ]}
                >
                  <Text style={s.stockBadgeText}>
                    {item.needs_stock_count
                      ? "? left"
                      : item.quantity_on_hand <= 0
                        ? "Out"
                        : `${item.quantity_on_hand} left`}
                  </Text>
                </View>
              </View>
              <Text style={s.productName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={s.productPrice}>
                {price === null
                  ? "No price"
                  : item.sale_price === null && item.regular_price === null && variantPrices.length
                    ? `From ${peso(price)}`
                    : peso(price)}
              </Text>
              {item.letters_required > 0 ? (
                <Text style={s.variantHint} numberOfLines={1}>
                  {item.letters_required} letter{item.letters_required === 1 ? "" : "s"}
                </Text>
              ) : item.variants.length ? (
                <Text style={s.variantHint} numberOfLines={1}>
                  {item.name === "Extra Alphabet"
                    ? "Design + letter"
                    : `Choose ${item.variant_label ?? "option"}`}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
      <Modal
        visible={Boolean(choosing)}
        transparent
        animationType="fade"
        onRequestClose={() => setChoosing(null)}
      >
        <SafeAreaView style={s.variantOverlay}>
          <View style={s.variantCard}>
            <View style={s.variantHeader}>
              <View style={s.flex}>
                <Text style={s.variantKicker}>
                  {choosing?.name === "Extra Alphabet" && choosing.variants.some((variant) => variant.name.includes(" | "))
                    ? chosenDesign
                      ? "CHOOSE A LETTER"
                      : "CHOOSE A DESIGN"
                    : choosing?.letters_required
                    ? `CHOOSE ${choosing.letters_required} LETTER${choosing.letters_required === 1 ? "" : "S"}`
                    : `CHOOSE ${choosing?.variant_label?.toUpperCase() ?? "OPTION"}`}
                </Text>
                <Text style={s.variantTitle}>{choosing?.name}</Text>
                {choosing?.name === "Extra Alphabet" && chosenDesign ? (
                  <Pressable onPress={() => setChosenDesign(null)}>
                    <Text style={s.variantChosen}>← {chosenDesign} · choose A to Z</Text>
                  </Pressable>
                ) : null}
                {choosing?.letters_required ? (
                  <Text style={s.variantChosen}>
                    {choosing.alphabet_style?.name ?? "Alphabet"}: {chosenLetters.length ? chosenLetters.join(" · ") : "Tap letters below"}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Close choices"
                style={s.guideClose}
                onPress={() => {
                  setChoosing(null);
                  setChosenLetters([]);
                  setChosenDesign(null);
                }}
              >
                <Ionicons name="close" size={24} color={C.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.variantGrid}>
              {choosing?.name === "Extra Alphabet" &&
              choosing.variants.some((variant) => variant.name.includes(" | "))
                ? chosenDesign
                  ? choosing.variants
                      .filter((variant) =>
                        variant.name.startsWith(`${chosenDesign} | `),
                      )
                      .map((variant) => {
                        const unavailable = variant.quantity_on_hand <= 0;
                        const letter = variant.name.split(" | ")[1];
                        return (
                          <Pressable
                            key={variant.id}
                            style={[s.variantButton, unavailable && s.disabled]}
                            disabled={unavailable}
                            onPress={() => add(choosing, variant)}
                          >
                            <Text style={s.variantButtonText}>{letter}</Text>
                            <Text style={[s.variantStock, unavailable && s.low]}>
                              {unavailable
                                ? "Out"
                                : `${variant.quantity_on_hand} left`}
                            </Text>
                          </Pressable>
                        );
                      })
                  : [
                      ...new Set(
                        choosing.variants.map(
                          (variant) => variant.name.split(" | ")[0],
                        ),
                      ),
                    ].map((design) => {
                      const designVariants = choosing.variants.filter((variant) =>
                        variant.name.startsWith(`${design} | `),
                      );
                      const price = designVariants.find(
                        (variant) => variant.price_override !== null,
                      )?.price_override;
                      const available = designVariants.reduce(
                        (sum, variant) => sum + variant.quantity_on_hand,
                        0,
                      );
                      return (
                        <Pressable
                          key={design}
                          style={[s.designButton, available <= 0 && s.disabled]}
                          disabled={available <= 0}
                          onPress={() => setChosenDesign(design)}
                        >
                          <Text style={s.designButtonText}>{design}</Text>
                          <Text style={s.designPrice}>
                            {price === null || price === undefined
                              ? "No price"
                              : peso(price)}
                          </Text>
                          <Text style={s.designStock}>{available} letters ready</Text>
                        </Pressable>
                      );
                    })
                : choosing?.letters_required
                ? choosing.alphabet_style?.letters.map((item) => {
                    const alreadyChosen = chosenLetters.filter(
                      (letter) => letter === item.letter,
                    ).length;
                    const selected = alreadyChosen > 0;
                    const unavailable =
                      item.needs_stock_count ||
                      item.quantity_on_hand <= alreadyChosen ||
                      chosenLetters.length >= choosing.letters_required;
                    return (
                      <Pressable
                        key={item.letter}
                        style={[
                          s.variantButton,
                          selected && s.variantButtonOn,
                          unavailable && !selected && s.disabled,
                        ]}
                        onPress={() => {
                          if (!unavailable)
                            setChosenLetters((old) => [...old, item.letter]);
                        }}
                      >
                        <Text style={[s.variantButtonText, selected && s.variantButtonTextOn]}>{item.letter}</Text>
                        <Text style={[s.variantStock, selected && s.variantStockOn, unavailable && !selected && s.low]}>
                          {selected
                            ? `Selected ×${alreadyChosen}`
                            : item.needs_stock_count
                            ? "? left"
                            : `${item.quantity_on_hand} left`}
                        </Text>
                        {selected ? (
                          <Pressable
                            accessibilityLabel={`Remove one ${item.letter}`}
                            style={s.variantRemove}
                            onPress={(event) => {
                              event.stopPropagation();
                              setChosenLetters((old) => {
                                const index = old.lastIndexOf(item.letter);
                                return index < 0
                                  ? old
                                  : [...old.slice(0, index), ...old.slice(index + 1)];
                              });
                            }}
                          >
                            <Ionicons name="remove" size={15} color={C.green} />
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  })
                : choosing?.variants.map((variant) => {
                const unavailable = variant.quantity_on_hand <= 0;
                return (
                  <Pressable
                    key={variant.id}
                    style={[s.variantButton, unavailable && s.disabled]}
                    disabled={unavailable}
                    onPress={() => add(choosing, variant)}
                  >
                    <Text style={s.variantButtonText}>{variant.name}</Text>
                    <Text style={[s.variantStock, unavailable && s.low]}>
                      {unavailable ? "Out" : `${variant.quantity_on_hand} left`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {choosing?.letters_required ? (
              <View style={s.letterFooter}>
                <Text style={s.letterCount}>
                  {chosenLetters.length} of {choosing.letters_required} selected
                </Text>
                <Pressable
                  style={[s.letterAddButton, chosenLetters.length !== choosing.letters_required && s.disabled]}
                  disabled={chosenLetters.length !== choosing.letters_required}
                  onPress={() => add(choosing, null, chosenLetters)}
                >
                  <Ionicons name="cart-outline" size={24} color={C.white} />
                  <Text style={s.letterAddText}>Add to sale</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
      {count > 0 ? (
        <View style={s.basket}>
          <View>
            <Text style={s.basketCount}>
              {count} item{count === 1 ? "" : "s"} selected
            </Text>
            <Text style={s.basketTotal}>{peso(total)}</Text>
          </View>
          <Pressable style={s.reviewButton} onPress={() => setReview(true)}>
            <Ionicons name="receipt-outline" size={22} color={C.white} />
            <Text style={s.reviewText}>Review & pay</Text>
            <Ionicons name="arrow-forward" size={22} color={C.white} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function QuickStart({ locationId, onOpen, permissions }: { locationId: string; onOpen: (screen: Screen) => void; permissions:StaffPermission[]|null }) {
  const { width } = useWindowDimensions();
  const [orderSummary, setOrderSummary] = useState({ active: 0, urgent: 0 });
  const [eventReminder, setEventReminder] = useState<ShopEvent | null>(null);
  const [openHomeGroups, setOpenHomeGroups] = useState<string[]>(["Run today"]);
  useEffect(() => {
    setEventReminder(null);
    supabase
      .from("external_orders")
      .select("status,target_date")
      .eq("location_id", locationId)
      .then(({ data }) => {
        const active = (data ?? []).filter((o) => !["completed", "cancelled"].includes(o.status)).length;
        const todayValue = localDateKey();
        const urgent = (data ?? []).filter((o) => !["completed", "cancelled"].includes(o.status) && o.target_date && o.target_date <= todayValue).length;
        setOrderSummary({ active, urgent });
      });
    const today = localDateKey();
    const end = new Date();
    end.setDate(end.getDate() + 30);
    supabase
      .from("shop_events")
      .select("id,business_id,location_id,title,event_date,start_time,venue,notes,remind_days_before,status,created_at,updated_at")
      .eq("location_id", locationId)
      .eq("status", "planned")
      .gte("event_date", today)
      .lte("event_date", localDateKey(end))
      .order("event_date")
      .order("start_time")
      .then(({ data }) => {
        const due = ((data ?? []) as ShopEvent[]).find((event) => {
          const eventDate = new Date(`${event.event_date}T12:00:00`);
          const now = new Date(`${today}T12:00:00`);
          const daysAway = Math.round((eventDate.getTime() - now.getTime()) / 86400000);
          return daysAway <= event.remind_days_before;
        });
        setEventReminder(due ?? null);
      });
  }, [locationId]);
  type HomeAction = {
    title: string;
    help: string;
    icon: Icon;
    screen: Screen;
  };
  type HomeGroup = {
    title: string;
    help: string;
    color: string;
    soft: string;
    border: string;
    actions: HomeAction[];
  };
  const groups: HomeGroup[] = [
    {
      title: "Run today", help: "Start here for today's work.", ...SECTION.sales, actions: [
        { title: "Sell", help: "Start a shop or fast event sale", icon: "cart", screen: "sell_start" },
        { title: "Sales today", help: "See today's total and receipts", icon: "today", screen: "dashboard" },
        { title: "Orders", help: orderSummary.active ? `${orderSummary.active} active · ${orderSummary.urgent} due now` : "Track customer orders", icon: "clipboard", screen: "orders" },
        { title: "Print Queue", help: "See what must be printed next", icon: "layers", screen: "print_queue" },
      ],
    },
    {
      title: "Stock & products", help: "Keep products ready to sell.", ...SECTION.stock, actions: [
        { title: "Stock", help: "Choose how to check or update stock", icon: "cube", screen: "stock_start" },
        { title: "Products & prices", help: "Add or edit products", icon: "pricetags", screen: "products" },
        { title: "Price list", help: "View or print prices", icon: "receipt", screen: "price_list" },
      ],
    },
    {
      title: "Production", help: "Manage printing equipment and materials.", ...SECTION.production, actions: [
        { title: "Price calculator", help: "Estimate a selling price", icon: "calculator", screen: "price_calculator" },
        { title: "Printers", help: "See which printers are working", icon: "hardware-chip", screen: "printers" },
        { title: "Filaments", help: "Track colours and spools", icon: "color-filter", screen: "filaments" },
      ],
    },
    {
      title: "Records & planning", help: "Fix records and look ahead.", ...SECTION.records, actions: [
        { title: "Sales reports", help: "Daily, weekly or monthly totals", icon: "bar-chart", screen: "reports" },
        { title: "Calendar", help: "Events and reminders", icon: "calendar", screen: "calendar" },
        { title: "Cancel wrong sale", help: "Find and cancel a mistaken sale", icon: "return-up-back", screen: "correct" },
        { title: "Add an earlier sale", help: "Forgot one? Choose the date it happened", icon: "calendar-number", screen: "missed" },
      ],
    },
    {
      title: "Shop & help", help: "Shop details, guides and support.", ...SECTION.settings, actions: [
        { title: "Shop profile", help: "Change the shop logo", icon: "storefront", screen: "shop" },
        { title: "More & help", help: "Settings and simple guides", icon: "grid", screen: "more" },
        { title: "Report a problem", help: "Send a message and optional photo", icon: "chatbox-ellipses", screen: "report_issue" },
      ],
    },
  ];
  const permissionFor=(screen:Screen):StaffPermission=>
    (["sell_start","sale","event_sale","missed"] as Screen[]).includes(screen)?"sell":
    (["dashboard","correct"] as Screen[]).includes(screen)?"sales":
    screen==="orders"?"orders":
    (["stock_start","inventory","alphabet_inventory"] as Screen[]).includes(screen)?"stock":
    (["products","price_list"] as Screen[]).includes(screen)?"products":
    screen==="reports"?"reports":
    (["print_queue","price_calculator","printers","filaments"] as Screen[]).includes(screen)?"production":
    screen==="calendar"?"calendar":"settings";
  const visibleGroups=groups.map(group=>({...group,actions:group.actions.filter(action=>!permissions||permissions.includes(permissionFor(action.screen)))})).filter(group=>group.actions.length);
  return (
    <ScrollView contentContainerStyle={s.quickScroll}>
      <Text style={s.pageTitle}>Your shop</Text>
      <Text style={s.subtitle}>Everything you need, grouped by task.</Text>
      {eventReminder ? (
        <Pressable style={s.homeReminder} onPress={() => onOpen("calendar")}>
          <View style={s.homeReminderIcon}><Ionicons name="notifications" size={23} color={C.white} /></View>
          <View style={s.flex}>
            <Text style={s.homeReminderLabel}>{eventReminder.event_date === localDateKey() ? "TODAY" : "COMING UP"}</Text>
            <Text style={s.homeReminderTitle} numberOfLines={2}>{eventReminder.title}</Text>
            <Text style={s.homeReminderMeta}>{friendlyLocalDate(eventReminder.event_date)}{eventReminder.start_time ? ` · ${eventReminder.start_time.slice(0, 5)}` : ""}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={SECTION.records.color} />
        </Pressable>
      ) : null}
      {visibleGroups.map((group) => (
        <View key={group.title} style={s.quickSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${group.title}. ${width >= 760 || openHomeGroups.includes(group.title) ? "Hide" : "Show"} tools`}
            disabled={width >= 760}
            style={s.quickSectionHeading}
            onPress={() => setOpenHomeGroups((current) => current.includes(group.title) ? current.filter((title) => title !== group.title) : [...current, group.title])}
          >
            <View style={[s.quickSectionMark,{backgroundColor:group.color}]} />
            <View style={s.flex}>
              <Text style={s.quickSectionTitle}>{group.title}</Text>
              <Text style={s.quickSectionHelp}>{group.help}</Text>
            </View>
            {width < 760 ? <Ionicons name={openHomeGroups.includes(group.title) ? "chevron-up" : "chevron-down"} size={21} color={group.color} /> : null}
          </Pressable>
          {width >= 760 || openHomeGroups.includes(group.title) ? <View style={s.quickGrid}>
            {group.actions.map((action) => (
              <Pressable
                key={action.title}
                accessibilityRole="button"
                accessibilityLabel={`${action.title}. ${action.help}`}
                style={({ pressed }) => [s.quickCard, { backgroundColor: group.soft, borderColor: group.border, width: width >= 920 ? "23.8%" : "48%" }, pressed && { opacity: 0.82, transform: [{ scale: .985 }] }]}
                onPress={() => onOpen(action.screen)}
              >
                <View pointerEvents="none" style={[s.quickIcon,{backgroundColor:group.color}]}><Ionicons name={action.icon} size={25} color={C.white} /></View>
                <Text pointerEvents="none" style={s.quickTitle}>{action.title}</Text>
                <Text pointerEvents="none" style={s.quickHelp}>{action.help}</Text>
                <View pointerEvents="none" style={s.quickGo}><Text style={[s.quickGoText,{color:group.color}]}>Open</Text><Ionicons name="arrow-forward" size={18} color={group.color} /></View>
              </Pressable>
            ))}
          </View> : null}
        </View>
      ))}
    </ScrollView>
  );
}

function AdminShopForm({ shop, mode, onBack, onDone }: { shop: AdminShop; mode: "edit" | "duplicate"; onBack: () => void; onDone: () => Promise<void> }) {
  const duplicate = mode === "duplicate";
  const [name, setName] = useState(duplicate ? `${shop.name} Copy` : shop.name);
  const [username, setUsername] = useState(duplicate ? "" : shop.login_username ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [copyStock, setCopyStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const functionMessage = async (error: any) => {
    let message = error?.message ?? "Please try again.";
    try { message = (await error?.context?.json())?.error ?? message; } catch {}
    return message;
  };
  const save = async () => {
    const clean = username.trim().toLowerCase();
    if (!name.trim()) return Alert.alert("Enter a shop name");
    if (!/^[a-z0-9._-]{3,30}$/.test(clean)) return Alert.alert("Check the username", "Use 3–30 letters, numbers, dots, dashes or underscores.");
    if (duplicate && password.length < 6) return Alert.alert("Password is too short", "Use at least 6 characters.");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-manage-shop", {
      body: { action: mode === "edit" ? "update" : "duplicate", shopId: shop.id, shopName: name.trim(), username: clean, password, copyStock },
    });
    setBusy(false);
    if (error) {
      let message = error.message;
      try { message = (await error.context?.json())?.error ?? message; } catch {}
      return Alert.alert(duplicate ? "Shop not duplicated" : "Profile not updated", message);
    }
    await onDone();
    Alert.alert(
      duplicate ? "Shop duplicated" : "Profile updated",
      duplicate
        ? `${data?.copiedProducts ?? 0} products and prices were copied. ${copyStock ? "Current stock numbers were copied." : "Stock starts at zero for the new shop."}`
        : `The shop can now sign in with ${clean}. Products, stock, sales and orders were kept.`,
    );
  };
  const changePassword = async () => {
    if (password.length < 6)
      return Alert.alert("Password is too short", "Use at least 6 characters.");
    if (password !== confirmPassword)
      return Alert.alert("Passwords do not match", "Type the same password twice.");
    setSecurityBusy(true);
    const { error } = await supabase.functions.invoke("admin-manage-shop", {
      body: { action: "change_password", shopId: shop.id, password },
    });
    setSecurityBusy(false);
    if (error) return Alert.alert("Password not changed", await functionMessage(error));
    setPassword("");
    setConfirmPassword("");
    Alert.alert("Login password changed", `${shop.name} can use the new password on the next login.`);
  };
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.adminTop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to owner account" style={s.backButton} onPress={onBack}><Ionicons name="arrow-back" size={23} color={C.ink} /></Pressable>
        <View style={s.flex}><Text style={s.kicker}>OWNER</Text><Text style={s.shopName}>{duplicate ? "Duplicate shop" : "Edit profile"}</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.adminPage}>
        <View style={s.editCard}>
          <Text style={s.editName}>{duplicate ? `Copy products and prices from ${shop.name}` : "Change the shop name or login username"}</Text>
          <Text style={s.rowHelp}>{duplicate ? "The new shop will have its own login, stock, sales and orders." : "Existing products, stock, sales and orders will not be removed."}</Text>
          <Label>Shop name</Label><TextInput style={s.input} value={name} onChangeText={setName} placeholder="Shop name" />
          <Label>Login username</Label><TextInput style={s.input} value={username} onChangeText={setUsername} placeholder="New username" autoCapitalize="none" autoCorrect={false} />
          {duplicate ? <><Label>Starting password</Label><TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry /><Pressable accessibilityRole="button" style={[s.copyStockChoice,copyStock&&s.copyStockChoiceOn]} onPress={() => setCopyStock((value) => !value)}><Ionicons name={copyStock?"checkbox":"square-outline"} size={23} color={copyStock?C.white:C.green}/><View style={s.flex}><Text style={[s.copyStockTitle,copyStock&&{color:C.white}]}>Copy current stock numbers</Text><Text style={[s.copyStockHelp,copyStock&&{color:"#E8F0EC"}]}>{copyStock?"The new shop receives the same counts.":"Recommended off: new shop starts at zero."}</Text></View></Pressable></> : <View style={s.note}><Ionicons name="information-circle" size={22} color={C.green}/><Text style={s.noteText}>Changing the username does not change the password.</Text></View>}
          <BigButton label={busy ? duplicate ? "Duplicating shop…" : "Saving profile…" : duplicate ? "Duplicate shop" : "Save profile"} icon={duplicate?"copy-outline":"save-outline"} onPress={save} disabled={busy} />
        </View>
        {!duplicate ? (
          <View style={s.ownerSecurityCard}>
            <View style={s.ownerSecurityHeading}>
              <View style={s.ownerSecurityIcon}><Ionicons name="shield-checkmark-outline" size={24} color={C.white} /></View>
              <View style={s.flex}>
                <Text style={s.editName}>Login & security</Text>
                <Text style={s.rowHelp}>New secrets are never shown or stored as readable text.</Text>
              </View>
            </View>
            <Text style={s.ownerSecurityTitle}>Change login password</Text>
            <Text style={s.rowHelp}>This changes the password used to sign in to this shop.</Text>
            <Label>New password</Label>
            <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry />
            <Label>Type new password again</Label>
            <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" secureTextEntry />
            <BigButton label={securityBusy ? "Changing password…" : "Change login password"} icon="key-outline" onPress={changePassword} disabled={securityBusy} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Dashboard({
  products,
  sales,
  onSell,
  onPrintQueue,
}: {
  products: Product[];
  sales: Sale[];
  onSell: () => void;
  onPrintQueue: () => void;
}) {
  const day = sales.filter((x) => x.status === "completed");
  const total = day.reduce((n, x) => n + Number(x.total), 0);
  const cash = day
    .filter((x) => x.payment_method === "cash")
    .reduce((n, x) => n + Number(x.total), 0);
  const low = products.filter(
    (x) => x.quantity_on_hand <= x.low_stock_threshold,
  );
  const map = new Map<string, number>();
  day
    .flatMap((x) => x.sale_items ?? [])
    .forEach((item) => {
      const name = item.variant_name
        ? `${item.product_name} · ${item.variant_name}`
        : item.selected_letters?.length
          ? `${item.product_name} · ${item.selected_letters.join("")}`
          : item.product_name;
      map.set(name, (map.get(name) ?? 0) + Number(item.quantity));
    });
  const sold = [...map]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  const printAgain = sold.map((item) => {
    const product = products.find((p) => item.name === p.name || item.name.startsWith(`${p.name} ·`));
    return product ? { ...item, left: product.quantity_on_hand } : null;
  }).filter((item): item is {name:string;quantity:number;left:number} => Boolean(item && item.left <= Math.max(3,item.quantity)));
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.pageTitle}>Today</Text>
      <Text style={s.subtitle}>{shortDate(new Date().toISOString())}</Text>
      <View style={s.hero}>
        <Text style={s.heroLabel}>Sales today</Text>
        <Text style={s.heroValue}>{peso(total)}</Text>
        <Text style={s.heroSmall}>
          {day.length} completed sale{day.length === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={s.stats}>
        <Stat
          label="Cash"
          value={peso(cash)}
          icon="cash-outline"
          color={C.accent}
        />
        <Stat
          label="GCash"
          value={peso(total - cash)}
          icon="phone-portrait-outline"
          color={C.green}
        />
      </View>
      <BigButton
        label="Start a new sale"
        onPress={onSell}
        icon="cart-outline"
      />
      <Text style={s.section}>Products sold today</Text>
      {sold.length ? (
        sold.map((item) => (
          <View key={item.name} style={s.soldRow}>
            <View style={s.soldIcon}>
              <Ionicons
                name={productIcon(item.name)}
                size={24}
                color={C.accent}
              />
            </View>
            <Text style={s.soldName}>{item.name}</Text>
            <View style={s.soldQty}>
              <Text style={s.soldQtyText}>{item.quantity}</Text>
            </View>
          </View>
        ))
      ) : (
        <Empty title="No products sold yet" />
      )}
      {printAgain.length ? <View style={[s.note,{marginTop:18}]}><Ionicons name="sparkles" size={22} color={SECTION.production.color}/><View style={s.flex}><Text style={s.rowTitle}>What to print next</Text><Text style={s.noteText}>{printAgain.slice(0,3).map(item=>`${item.name}: ${item.quantity} sold, ${item.left} left`).join("\n")}</Text><Pressable style={s.inlineLink} onPress={onPrintQueue}><Text style={[s.inlineLinkText,{color:SECTION.production.color}]}>Open Print Queue</Text><Ionicons name="arrow-forward" size={17} color={SECTION.production.color}/></Pressable></View></View>:null}
      <Text style={s.section}>Today’s sales</Text>
      {day.length ? (
        day.map((sale) => (
          <View key={sale.id} style={s.receipt}>
            <View style={s.receiptTop}>
              <View>
                <Text style={s.rowTitle}>Sale {sale.receipt_number}</Text>
                <Text style={s.rowHelp}>
                  {new Date(sale.created_at).toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <View style={s.receiptRight}>
                <Text style={s.rowPrice}>{peso(Number(sale.total))}</Text>
                <Text style={s.paymentText}>
                  {sale.payment_method === "cash" ? "CASH" : "GCASH"}
                </Text>
              </View>
            </View>
            <View style={s.receiptItems}>
              {(sale.sale_items ?? []).map((item, index) => (
                <Text
                  key={`${item.product_name}-${index}`}
                  style={s.receiptProduct}
                >
                  {item.quantity} × {item.product_name}
                  {item.variant_name ? ` · ${item.variant_name}` : ""}
                  {item.selected_letters?.length
                    ? ` · ${item.selected_letters.join("")}`
                    : ""}
                </Text>
              ))}
            </View>
          </View>
        ))
      ) : (
        <Empty title="No sales yet today" />
      )}
      <Text style={s.section}>Stock that needs attention</Text>
      {low.length ? (
        low.slice(0, 8).map((p) => (
          <View key={p.id} style={s.attention}>
            <View style={s.alertIcon}>
              <Ionicons name="alert" size={20} color={C.orange} />
            </View>
            <View>
              <Text style={s.rowTitle}>{p.name}</Text>
              <Text style={s.rowHelp}>
                {p.needs_stock_count
                  ? "Please count this stock"
                  : `${p.quantity_on_hand} left. Add stock soon`}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Empty title="Stock looks good" />
      )}
    </ScrollView>
  );
}

function Products({
  businessId,
  locationId,
  products,
  categories,
  initialProductId,
  onSaved,
  onBack,
}: {
  businessId: string;
  locationId: string;
  products: Product[];
  categories: Category[];
  initialProductId?: string | null;
  onSaved: () => void;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [openedInitial, setOpenedInitial] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [regular, setRegular] = useState("");
  const [sale, setSale] = useState("");
  const [startingStock, setStartingStock] = useState("0");
  const [productKind, setProductKind] = useState<"other" | "clicker">("other");
  const [clickerStyleId, setClickerStyleId] = useState<string | null>(null);
  const [clickerSlots, setClickerSlots] = useState(1);
  const [hasChoices, setHasChoices] = useState(false);
  const [extraAlphabetMode, setExtraAlphabetMode] = useState(false);
  const [designPrices, setDesignPrices] = useState("Normal: 20\nSuperman: 50");
  const [choiceLabel, setChoiceLabel] = useState("Letter");
  const [choiceText, setChoiceText] = useState("");
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState("image/jpeg");
  const [saving, setSaving] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const category = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const alphabetStyles = Array.from(
    new Map(
      products
        .filter((product) => product.alphabet_style)
        .map((product) => [product.alphabet_style!.id, product.alphabet_style!]),
    ).values(),
  );
  const clickerName = (styleId = clickerStyleId, slots = clickerSlots) => {
    const style = alphabetStyles.find((item) => item.id === styleId)?.name ?? "Universal";
    return `Keyboard Clicker ${style} ${slots} Slot${slots === 1 ? "" : "s"}`;
  };
  const reset = () => {
    setSelected(null);
    setCreating(false);
    setName("");
    setCategoryId(null);
    setRegular("");
    setSale("");
    setStartingStock("0");
    setProductKind("other");
    setClickerStyleId(null);
    setClickerSlots(1);
    setHasChoices(false);
    setExtraAlphabetMode(false);
    setDesignPrices("Normal: 20\nSuperman: 50");
    setChoiceLabel("Letter");
    setChoiceText("");
    setPickedUri(null);
    setPickedMime("image/jpeg");
  };
  const open = (p: Product) => {
    setSelected(p);
    setCreating(false);
    setName(p.name);
    setCategoryId(p.category_id);
    setRegular(p.regular_price?.toString() ?? "");
    setSale(p.sale_price?.toString() ?? "");
    setHasChoices(p.variants.length > 0);
    setChoiceLabel(p.variant_label ?? "Choice");
    setChoiceText(p.variants.map((v) => v.name).join(", "));
    setPickedUri(null);
    const isClicker = p.letters_required > 0 && /keyboard\s+clicker/i.test(p.name);
    setProductKind(isClicker ? "clicker" : "other");
    setClickerStyleId(isClicker ? p.alphabet_style?.id ?? null : null);
    setClickerSlots(isClicker ? p.letters_required : 1);
  };
  useEffect(() => {
    if (!initialProductId || openedInitial || selected || creating) return;
    const product = products.find((item) => item.id === initialProductId);
    if (product) {
      open(product);
      setOpenedInitial(true);
    }
  }, [initialProductId, openedInitial, products]);
  const startCreate = () => {
    reset();
    setCreating(true);
    setCategoryId(categories[0]?.id ?? null);
  };
  const startExtraAlphabet = () => {
    reset();
    setCreating(true);
    setName("Extra Alphabet");
    setCategoryId(
      categories.find((item) => item.name === "Keyboard Clickers")?.id ??
        categories[0]?.id ??
        null,
    );
    setHasChoices(true);
    setExtraAlphabetMode(true);
    setChoiceLabel("Design and letter");
    setChoiceText("");
    setDesignPrices("Normal: 20\nSuperman: 50");
    setStartingStock("0");
  };
  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "Photo access needed",
        "Allow Mik to choose a product photo from this device.",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const resizeFor = (limit: number) =>
        Math.max(asset.width, asset.height) > limit
          ? [asset.width >= asset.height ? { resize: { width: limit } } : { resize: { height: limit } }]
          : [];
      let resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        resizeFor(900),
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
      );
      let compressedBytes = (await (await fetch(resized.uri)).arrayBuffer()).byteLength;
      if (compressedBytes > 700 * 1024) {
        resized = await ImageManipulator.manipulateAsync(
          asset.uri,
          resizeFor(720),
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
        );
        compressedBytes = (await (await fetch(resized.uri)).arrayBuffer()).byteLength;
      }
      if (compressedBytes > 1024 * 1024)
        return Alert.alert(
          "Photo is still too large",
          "Choose a smaller photo or take a normal phone screenshot of it, then try again.",
        );
      setPickedUri(resized.uri);
      setPickedMime("image/jpeg");
    }
  };
  const uploadImage = async (productId: string, uri: string) => {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Photo could not be read");
    const bytes = await response.arrayBuffer();
    const path = `${businessId}/${productId}/main.jpg`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType: pickedMime, upsert: true });
    if (error) throw error;
    return `${supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  };
  const numbers = () => {
    const r = regular.trim() === "" ? null : Number(regular);
    const sp = sale.trim() === "" ? null : Number(sale);
    if (
      (r !== null && (!Number.isFinite(r) || r < 0)) ||
      (sp !== null && (!Number.isFinite(sp) || sp < 0))
    )
      return null;
    return { r, sp };
  };
  const choiceNames = () => [
    ...new Set(
      choiceText
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const extraAlphabetDesigns = () =>
    designPrices
      .split(/\n/)
      .map((line) => {
        const match = line.match(/^\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
        return match ? { name: match[1].trim(), price: Number(match[2]) } : null;
      })
      .filter((item): item is { name: string; price: number } => Boolean(item));
  const useAlphabet = () => {
    setHasChoices(true);
    setChoiceLabel("Letter");
    setChoiceText(
      Array.from({ length: 26 }, (_, index) =>
        String.fromCharCode(65 + index),
      ).join(", "),
    );
  };
  const saveCategory = async () => {
    const clean = categoryName.trim();
    if (!clean) return Alert.alert("Enter a category name");
    setCategoryBusy(true);
    const result = editingCategory
      ? await supabase.from("categories").update({ name: clean }).eq("id", editingCategory.id)
      : await supabase.from("categories").insert({ business_id: businessId, name: clean });
    setCategoryBusy(false);
    if (result.error) return Alert.alert("Category not saved", result.error.message);
    setCategoryName("");
    setEditingCategory(null);
    await onSaved();
  };
  const deleteCategory = (item: Category) =>
    Alert.alert("Remove this category?", `Products in ${item.name} will remain available and can be moved to another category.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Remove category", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("categories").update({ active: false }).eq("id", item.id);
        if (error) return Alert.alert("Category not removed", error.message);
        if (categoryId === item.id) setCategoryId(null);
        await onSaved();
      } },
    ]);
  const deleteProduct = () => {
    if (!selected) return;
    confirmDestructive(
      "Delete this product?",
      `${selected.name} will disappear from Sell and Stock. Past sales will stay safe.`,
      "Delete product",
      () => {
        void (async () => {
            setSaving(true);
            const { error } = await supabase
              .from("products")
              .update({ active: false })
              .eq("id", selected.id);
            if (error) {
              setSaving(false);
              return Alert.alert("Product not deleted", error.message);
            }

            let imageRemoved = true;
            const storageMarker = "/storage/v1/object/public/product-images/";
            if (selected.image_url?.includes(storageMarker)) {
              const storedImagePath = decodeURIComponent(
                selected.image_url.split(storageMarker)[1].split("?")[0],
              );
              const { data: imageUsers, error: referenceError } = await supabase
                .from("products")
                .select("id")
                .neq("id", selected.id)
                .eq("active", true)
                .like("image_url", `%${storageMarker}${storedImagePath}%`)
                .limit(1);
              if (referenceError || (imageUsers?.length ?? 0) > 0) imageRemoved = false;
              else {
                const { error: removeError } = await supabase.storage
                  .from("product-images")
                  .remove([storedImagePath]);
                imageRemoved = !removeError;
              }
            }
            if (imageRemoved)
              await supabase.from("products").update({ image_url: null }).eq("id", selected.id);
            setSaving(false);
            await onSaved();
            reset();
            Alert.alert(
              "Product deleted",
              imageRemoved
                ? "Its stored photo was removed. Past sales were not changed."
                : "Past sales were not changed. The photo was kept because another product may still use it.",
            );
        })();
      },
    );
  };
  const chooseProductKind = (kind: "other" | "clicker") => {
    setProductKind(kind);
    if (kind === "clicker") {
      const firstStyle = clickerStyleId ?? alphabetStyles[0]?.id ?? null;
      setClickerStyleId(firstStyle);
      setCategoryId(
        categories.find((item) => /keyboard|clicker|keycap/i.test(item.name))?.id ??
          categories[0]?.id ??
          null,
      );
      setHasChoices(false);
      setName(clickerName(firstStyle, clickerSlots));
    }
  };
  const duplicateProduct = () => {
    if (!selected) return;
    Alert.alert(
      "Duplicate this product?",
      `A new copy of ${selected.name} will be created with zero stock.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Duplicate",
          onPress: async () => {
            setSaving(true);
            const { data: createdId, error } = await supabase.rpc(
              "create_product_with_choices",
              {
                p_business_id: businessId,
                p_location_id: locationId,
                p_name: `${selected.name} copy`,
                p_category_id: selected.category_id,
                p_regular_price: selected.regular_price,
                p_sale_price: selected.sale_price,
                p_starting_stock: 0,
                p_variant_label: selected.variants.length
                  ? selected.variant_label ?? "Choice"
                  : null,
                p_variants: selected.variants.map((variant) => ({
                  name: variant.name,
                })),
              },
            );
            if (error || !createdId) {
              setSaving(false);
              return Alert.alert(
                "Product not duplicated",
                error?.message ?? "Please try again.",
              );
            }
            const { error: copyError } = await supabase
              .from("products")
              .update({
                image_url: selected.image_url,
                low_stock_threshold: selected.low_stock_threshold,
                letters_required: selected.letters_required,
                alphabet_style_id: selected.alphabet_style?.id ?? null,
              })
              .eq("id", createdId);
            if (!copyError && selected.variants.length) {
              const { data: copiedVariants } = await supabase
                .from("product_variants")
                .select("id,name")
                .eq("product_id", createdId);
              for (const copied of copiedVariants ?? []) {
                const source = selected.variants.find(
                  (variant) => variant.name === copied.name,
                );
                if (
                  source?.price_override !== null &&
                  source?.price_override !== undefined
                )
                  await supabase
                    .from("product_variants")
                    .update({ price_override: source.price_override })
                    .eq("id", copied.id);
              }
            }
            setSaving(false);
            await onSaved();
            reset();
            Alert.alert(
              "Product duplicated",
              "The copy has zero stock. Open it to change its name, photo, or price.",
            );
          },
        },
      ],
    );
  };
  const save = async () => {
    const cleanName = name.trim();
    const prices = numbers();
    if (!cleanName) return Alert.alert("Product name needed", "Enter a short name that the cashier will recognise.");
    if (!categoryId) return Alert.alert("Category needed", "Choose where this product should appear on the Sell screen.");
    if (!prices)
      return Alert.alert(
        "Check the price",
        "Enter a valid price or leave the sale price empty.",
      );
    if (!extraAlphabetMode && prices.r === null)
      return Alert.alert("Normal price needed", "Enter the product's usual selling price. The sale price can stay empty.");
    if (productKind === "clicker" && !clickerStyleId)
      return Alert.alert(
        "Keycap set needed",
        "Choose Universal or Character so Mik knows which shared A–Z stock to use.",
      );
    if (extraAlphabetMode) {
      const designs = extraAlphabetDesigns();
      if (!designs.length || designs.some((design) => design.price < 20 || design.price > 50))
        return Alert.alert(
          "Check the design prices",
          "Use one line per design, such as Normal: 20 or Superman: 50. Each price must be from ₱20 to ₱50.",
        );
    }
    setSaving(true);
    if (creating) {
      const stock = Number(startingStock);
      if (!Number.isInteger(stock) || stock < 0) {
        setSaving(false);
        return Alert.alert(
          "Check starting stock",
          "Enter a whole number of zero or more.",
        );
      }
      const designs = extraAlphabetMode ? extraAlphabetDesigns() : [];
      const variantSetup = extraAlphabetMode
        ? designs.flatMap((design) =>
            Array.from({ length: 26 }, (_, index) => ({
              name: `${design.name} | ${String.fromCharCode(65 + index)}`,
              price: design.price,
            })),
          )
        : hasChoices
          ? choiceNames().map((variantName) => ({ name: variantName, price: null }))
          : [];
      if (hasChoices && !choiceLabel.trim()) {
        setSaving(false);
        return Alert.alert(
          "Name the choice",
          "Example: Letter, Colour, or Size.",
        );
      }
      if (hasChoices && variantSetup.length < 2) {
        setSaving(false);
        return Alert.alert(
          "Add choices",
          "Enter at least two choices, such as A, B, C.",
        );
      }
      const { data: createdId, error } = await supabase.rpc(
        "create_product_with_choices",
        {
          p_business_id: businessId,
          p_location_id: locationId,
          p_name: cleanName,
          p_category_id: categoryId,
          p_regular_price: prices.r,
          p_sale_price: prices.sp,
          p_starting_stock: stock,
          p_variant_label: hasChoices ? choiceLabel.trim() : null,
          p_variants: variantSetup.map((variant) => ({ name: variant.name })),
        },
      );
      if (error || !createdId) {
        setSaving(false);
        return Alert.alert(
          "Product not created",
          error?.message ?? "Please try again.",
        );
      }
      if (productKind === "clicker") {
        const { error: clickerError } = await supabase
          .from("products")
          .update({
            alphabet_style_id: clickerStyleId,
            letters_required: clickerSlots,
          })
          .eq("id", createdId);
        if (clickerError) {
          setSaving(false);
          return Alert.alert(
            "Clicker setup not saved",
            "The product was created, but its shared A–Z stock was not connected. Open it and try again.",
          );
        }
      }
      if (extraAlphabetMode) {
        const { data: createdVariants } = await supabase
          .from("product_variants")
          .select("id,name")
          .eq("product_id", createdId);
        for (const createdVariant of createdVariants ?? []) {
          const configured = variantSetup.find(
            (variant) => variant.name === createdVariant.name,
          );
          if (configured?.price !== null && configured?.price !== undefined)
            await supabase
              .from("product_variants")
              .update({ price_override: configured.price })
              .eq("id", createdVariant.id);
        }
      }
      if (pickedUri) {
        try {
          const image_url = await uploadImage(String(createdId), pickedUri);
          const { error: imageLinkError } = await supabase
            .from("products")
            .update({ image_url })
            .eq("id", createdId);
          if (imageLinkError) throw imageLinkError;
        } catch {
          setSaving(false);
          await onSaved();
          reset();
          return Alert.alert(
            "Product created",
            "The item and stock were saved without the photo. Open it and try adding the photo again.",
          );
        }
      }
      setSaving(false);
      await onSaved();
      reset();
      return Alert.alert("Product created", `${cleanName} is ready to sell.`);
    }
    if (!selected) {
      setSaving(false);
      return;
    }
    let image_url = selected.image_url;
    try {
      if (pickedUri) image_url = await uploadImage(selected.id, pickedUri);
    } catch {
      setSaving(false);
      return Alert.alert("Photo not saved", "Please choose the photo again.");
    }
    const { error } = await supabase
      .from("products")
      .update({
        name: cleanName,
        category_id: categoryId,
        regular_price: prices.r,
        sale_price: prices.sp,
        image_url,
        alphabet_style_id: productKind === "clicker" ? clickerStyleId : null,
        letters_required: productKind === "clicker" ? clickerSlots : 0,
      })
      .eq("id", selected.id);
    setSaving(false);
    if (error) return Alert.alert("Product not saved", error.message);
    await onSaved();
    reset();
    Alert.alert(
      "Product updated",
      "The new details will be used for the next sale.",
    );
  };
  if (selected || creating) {
    const image = pickedUri ?? selected?.image_url ?? null;
    const placeholder = selected ? placeholderImage(selected.name) : null;
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back
          title={creating ? "New product" : "Edit product"}
          onPress={reset}
        />
        <View style={s.editCard}>
          <View style={s.requiredNote}>
            <Ionicons name="information-circle-outline" size={21} color={SECTION.stock.color}/>
            <Text style={s.requiredNoteText}><Text style={s.requiredNoteStrong}>Required:</Text> product name, category and normal price. <Text style={s.requiredNoteStrong}>Optional:</Text> photo, sale price and choices.</Text>
          </View>
          <View style={s.formStep}><View style={[s.formStepNumber,{backgroundColor:SECTION.stock.color}]}><Text style={s.formStepNumberText}>1</Text></View><View style={s.flex}><Text style={s.formStepTitle}>Help the cashier recognise it</Text><Text style={s.formStepHelp}>Use a short product name. Add a photo when one is available.</Text></View></View>
          <Label>What are you adding?</Label>
          <View style={s.productKindChoices}>
            <Pressable
              style={[s.productKindChoice, productKind === "other" && s.productKindChoiceOn]}
              onPress={() => chooseProductKind("other")}
            >
              <Ionicons name="cube-outline" size={24} color={productKind === "other" ? C.white : SECTION.stock.color} />
              <View style={s.flex}>
                <Text style={[s.productKindTitle, productKind === "other" && s.productKindTextOn]}>Other product</Text>
                <Text style={[s.productKindHelp, productKind === "other" && s.productKindHelpOn]}>Fidget, keychain, display item or anything else</Text>
              </View>
            </Pressable>
            <Pressable
              style={[s.productKindChoice, productKind === "clicker" && s.productKindChoiceOn]}
              onPress={() => chooseProductKind("clicker")}
            >
              <Ionicons name="keypad-outline" size={24} color={productKind === "clicker" ? C.white : SECTION.stock.color} />
              <View style={s.flex}>
                <Text style={[s.productKindTitle, productKind === "clicker" && s.productKindTextOn]}>Keyboard clicker</Text>
                <Text style={[s.productKindHelp, productKind === "clicker" && s.productKindHelpOn]}>MIK connects it to the correct shared A–Z stock</Text>
              </View>
            </Pressable>
          </View>
          {productKind === "clicker" ? (
            <View style={s.clickerSetup}>
              <Text style={s.clickerSetupTitle}>Set up the clicker</Text>
              <Text style={s.rowHelp}>1. Choose the keycaps included by default.</Text>
              <View style={s.choicePills}>
                {alphabetStyles.map((style) => (
                  <Pressable
                    key={style.id}
                    style={[s.clickerOption, clickerStyleId === style.id && s.clickerOptionOn]}
                    onPress={() => {
                      setClickerStyleId(style.id);
                      setName(clickerName(style.id, clickerSlots));
                    }}
                  >
                    <Text style={[s.clickerOptionText, clickerStyleId === style.id && s.clickerOptionTextOn]}>{style.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[s.rowHelp,{marginTop:12}]}>2. Choose how many keycaps fit in the empty base.</Text>
              <View style={s.choicePills}>
                {[1,2,3,4,5,6].map((slots) => (
                  <Pressable
                    key={slots}
                    style={[s.clickerSlot, clickerSlots === slots && s.clickerOptionOn]}
                    onPress={() => {
                      setClickerSlots(slots);
                      setName(clickerName(clickerStyleId, slots));
                    }}
                  >
                    <Text style={[s.clickerOptionText, clickerSlots === slots && s.clickerOptionTextOn]}>{slots}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.clickerLogicNote}>
                <Ionicons name="information-circle-outline" size={21} color={SECTION.stock.color}/>
                <Text style={s.clickerLogicText}>Each sale removes 1 empty clicker base and {clickerSlots} chosen keycap{clickerSlots === 1 ? "" : "s"} from the shared {alphabetStyles.find((item) => item.id === clickerStyleId)?.name ?? "selected"} A–Z stock.</Text>
              </View>
            </View>
          ) : null}
          <View style={s.productPhoto}>
            {image || placeholder ? (
              <Image source={image ? { uri: image } : placeholder} style={s.productPhotoImage} />
            ) : (
              <View style={s.missingPhoto}>
                <Text style={s.missingPhotoText}>PRODUCT PHOTO NEEDED</Text>
              </View>
            )}
          </View>
          <BigButton
            label={image ? "Change product photo · Optional" : "Add product photo · Optional"}
            icon="camera-outline"
            color={SECTION.stock.color}
            onPress={chooseImage}
          />
          <Label>Product name · Required</Label>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Example: Blue keychain"
          />
          <View style={s.formStep}><View style={[s.formStepNumber,{backgroundColor:SECTION.stock.color}]}><Text style={s.formStepNumberText}>2</Text></View><View style={s.flex}><Text style={s.formStepTitle}>Choose where it appears</Text><Text style={s.formStepHelp}>The category helps the cashier find this product quickly on the Sell screen.</Text></View></View>
          <Label>Category · Required</Label>
          <Pressable style={s.manageCategoryButton} onPress={() => setManagingCategories(true)}>
            <Ionicons name="settings-outline" size={20} color={C.dark} />
            <Text style={s.manageCategoryText}>Add or manage categories</Text>
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={categoryIcon(c.name)}
                tone={categoryTone(c.name)}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
          <View style={s.formStep}><View style={[s.formStepNumber,{backgroundColor:SECTION.stock.color}]}><Text style={s.formStepNumberText}>3</Text></View><View style={s.flex}><Text style={s.formStepTitle}>Set the selling options</Text><Text style={s.formStepHelp}>{extraAlphabetMode ? "Create the design here. Later, use Stock → A–Z letters to count each A–Z keycap." : "Enter the usual price. Add a sale price only when the item is discounted."}</Text></View></View>
          {extraAlphabetMode ? (
            <View style={s.choiceSetup}>
              <Text style={s.rowTitle}>Design prices</Text>
              <Text style={s.rowHelp}>One design and price per line. Every design automatically receives A to Z.</Text>
              <TextInput
                style={[s.input, s.choiceInput]}
                value={designPrices}
                onChangeText={setDesignPrices}
                placeholder={"Normal: 20\nSuperman: 50"}
                multiline
              />
            </View>
          ) : (
            <>
              <Label>Normal price · Required</Label>
              <TextInput style={s.priceInput} keyboardType="decimal-pad" value={regular} onChangeText={setRegular} placeholder="0.00" />
              <Label>Sale price · Optional</Label>
              <TextInput style={s.priceInput} keyboardType="decimal-pad" value={sale} onChangeText={setSale} placeholder="Leave empty when not on sale" />
            </>
          )}
          {creating && !extraAlphabetMode ? (
            <View style={s.choiceSetup}>
              <View style={s.choiceSetupTop}>
                <View style={s.flex}>
                  <Text style={s.rowTitle}>Does it have choices?</Text>
                  <Text style={s.rowHelp}>
                    Example: letters A–Z, colours, or sizes
                  </Text>
                </View>
                <Pressable
                  style={[s.choiceToggle, hasChoices && s.choiceToggleOn]}
                  onPress={() => setHasChoices((value) => !value)}
                >
                  <Text
                    style={[
                      s.choiceToggleText,
                      hasChoices && s.choiceToggleTextOn,
                    ]}
                  >
                    {hasChoices ? "YES" : "NO"}
                  </Text>
                </Pressable>
              </View>
              {hasChoices ? (
                <>
                  <Label>Choice name · Required when choices are on</Label>
                  <TextInput
                    style={s.input}
                    value={choiceLabel}
                    onChangeText={setChoiceLabel}
                    placeholder="Example: Letter"
                  />
                  <Pressable style={s.alphabetButton} onPress={useAlphabet}>
                    <Ionicons name="text-outline" size={22} color={C.green} />
                    <Text style={s.alphabetText}>Use letters A to Z</Text>
                  </Pressable>
                  <Label>Choices · Required when choices are on</Label>
                  <TextInput
                    style={[s.input, s.choiceInput]}
                    value={choiceText}
                    onChangeText={setChoiceText}
                    placeholder="A, B, C"
                    multiline
                  />
                  <Text style={s.rowHelp}>
                    Separate each choice with a comma.
                  </Text>
                </>
              ) : null}
            </View>
          ) : !creating && hasChoices ? (
            <View style={s.choiceSetup}>
              <Text style={s.rowTitle}>{choiceLabel} choices</Text>
              <View style={s.choicePills}>
                {selected?.variants.map((variant) => (
                  <View key={variant.id} style={s.choicePill}>
                    <Text style={s.choicePillText}>{variant.name}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.rowHelp}>
                Stock for each choice is changed from the Stock screen.
              </Text>
            </View>
          ) : null}
          {creating ? (
            <>
              <View style={s.formStep}><View style={[s.formStepNumber,{backgroundColor:SECTION.stock.color}]}><Text style={s.formStepNumberText}>4</Text></View><View style={s.flex}><Text style={s.formStepTitle}>Enter what you have now</Text><Text style={s.formStepHelp}>This becomes the starting stock. You can correct it later from Stock.</Text></View></View>
              <Label>
                {productKind === "clicker"
                  ? "Empty clicker bases ready to use · Required"
                  : hasChoices
                  ? "Starting stock for each choice · Required"
                  : "Starting stock at this shop · Required"}
              </Label>
              <TextInput
                style={s.qtyInput}
                keyboardType="number-pad"
                value={startingStock}
                onChangeText={setStartingStock}
                placeholder="0"
              />
            </>
          ) : null}
          <View style={s.note}>
            <Ionicons name="information-circle" size={22} color={C.green} />
            <Text style={s.noteText}>
              {creating
                ? "A photo is optional. Without one, Mik shows “Product photo needed” until a photo is added."
                : "A sale price is used automatically when entered. The photo can be added or changed later."}
            </Text>
          </View>
          <BigButton
            label={
              saving
                ? creating
                  ? "Creating product…"
                  : "Saving product…"
                : creating
                  ? "Create product"
                  : "Save changes"
            }
            icon={creating ? "add-circle-outline" : "save-outline"}
            color={SECTION.stock.color}
            onPress={save}
            disabled={saving}
          />
          {!creating ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Duplicate product"
                style={s.duplicateProductButton}
                onPress={duplicateProduct}
                disabled={saving}
              >
                <Ionicons name="copy-outline" size={20} color={C.accent} />
                <View style={s.flex}>
                  <Text style={s.duplicateProductText}>Duplicate product</Text>
                  <Text style={s.rowHelp}>Copy details with zero stock</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete product"
                style={s.deleteProductButton}
                onPress={deleteProduct}
                disabled={saving}
              >
                <Ionicons name="trash-outline" size={20} color={C.red} />
                <Text style={s.deleteProductText}>Delete product</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    );
  }
  if (managingCategories) {
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back title="Product categories" onPress={() => { setManagingCategories(false); setEditingCategory(null); setCategoryName(""); }} />
        <View style={s.editCard}>
          <Text style={s.rowTitle}>{editingCategory ? "Rename category" : "Add a category"}</Text>
          <TextInput style={s.input} value={categoryName} onChangeText={setCategoryName} placeholder="Example: Keychains" />
          <BigButton label={categoryBusy ? "Saving…" : editingCategory ? "Save category name" : "Add category"} icon="add-circle-outline" color={SECTION.stock.color} onPress={saveCategory} disabled={categoryBusy} />
          {editingCategory ? <Pressable style={s.cancelCategory} onPress={() => { setEditingCategory(null); setCategoryName(""); }}><Text style={s.cancelCategoryText}>Cancel rename</Text></Pressable> : null}
        </View>
        <Text style={[s.rowTitle, { marginTop: 20 }]}>Current categories</Text>
        {categories.map((item) => (
          <View key={item.id} style={s.categoryManageRow}>
            <View style={[s.categoryManageIcon, { backgroundColor: categoryTone(item.name).soft }]}><Ionicons name={categoryIcon(item.name)} size={22} color={categoryTone(item.name).color} /></View>
            <Text style={[s.rowTitle, s.flex]}>{item.name}</Text>
            <Pressable accessibilityLabel={`Rename ${item.name}`} style={s.smallAction} onPress={() => { setEditingCategory(item); setCategoryName(item.name); }}><Ionicons name="pencil-outline" size={21} color={C.dark} /></Pressable>
            <Pressable accessibilityLabel={`Remove ${item.name}`} style={[s.smallAction, s.smallActionDanger]} onPress={() => deleteCategory(item)}><Ionicons name="trash-outline" size={21} color={C.red} /></Pressable>
          </View>
        ))}
      </ScrollView>
    );
  }
  return (
    <View style={s.flex}>
      <Back title="Products" onPress={onBack} />
      <BigButton
        label="Create a new product"
        icon="add-circle-outline"
        color={SECTION.stock.color}
        onPress={startCreate}
      />
      <View style={s.manageCategoryButton}>
        <Ionicons name="information-circle-outline" size={20} color={SECTION.stock.color} />
        <View style={s.flex}>
          <Text style={s.manageCategoryText}>Adding a clicker?</Text>
          <Text style={s.rowHelp}>Tap Create a new product, then choose Keyboard clicker. MIK will connect its Universal or Character A–Z stock.</Text>
        </View>
      </View>
      <Pressable style={s.manageCategoryButton} onPress={() => setManagingCategories(true)}>
        <Ionicons name="albums-outline" size={20} color={C.dark} />
        <Text style={s.manageCategoryText}>Add, rename or remove categories</Text>
      </Pressable>
      <Search value={search} onChange={setSearch} />
      <FlatList
        data={products.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase()),
        )}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <Pressable style={s.listRow} onPress={() => open(item)}>
            {item.image_url || placeholderImage(item.name) ? (
              <Image source={item.image_url ? { uri: item.image_url } : placeholderImage(item.name)} style={s.listImage} />
            ) : (
              <View style={s.listMissingPhoto}>
                <Text style={s.listMissingText}>PHOTO{`\n`}NEEDED</Text>
              </View>
            )}
            <View style={s.flex}>
              <Text style={s.rowTitle}>{item.name}</Text>
              <Text style={s.rowHelp}>
                {category(item.category_id)} · {item.quantity_on_hand} in stock
                {item.variants.length
                  ? ` across ${item.variants.length} ${item.variant_label?.toLowerCase() ?? "choice"} choices`
                  : ""}
              </Text>
            </View>
            <Text style={s.rowPrice}>
              {item.sale_price !== null
                ? peso(item.sale_price)
                : item.regular_price === null
                  ? "No price"
                  : peso(item.regular_price)}
            </Text>
            <Ionicons name="chevron-forward" size={22} color={C.muted} />
          </Pressable>
        )}
      />
    </View>
  );
}

function Inventory({
  products,
  categories,
  locationId,
  onSaved,
  alphabetOnly = false,
  onBack,
  onManageProducts,
}: {
  products: Product[];
  categories: Category[];
  locationId: string;
  onSaved: () => void;
  alphabetOnly?: boolean;
  onBack: () => void;
  onManageProducts: (productId?: string) => void;
}) {
  const { width } = useWindowDimensions();
  const stockColumns = width >= 900 ? 2 : 1;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [stockView, setStockView] = useState<"all" | "lowest" | "out" | "count">("all");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [mode, setMode] = useState<"stock_in" | "set" | "damage">("stock_in");
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Other";
  const shownStock = (p: Product) => p.name.startsWith("Extra Alphabet -") && p.alphabet_style
    ? p.alphabet_style.letters.reduce((total, item) => total + item.quantity_on_hand, 0)
    : p.variants.length
      ? p.variants.reduce((total, item) => total + item.quantity_on_hand, 0)
      : p.quantity_on_hand;
  const needsCount = (p: Product) => p.needs_stock_count || Boolean(p.alphabet_style?.letters.some((item) => item.needs_stock_count));
  const stockProducts = alphabetOnly
    ? products.filter((p) => Boolean(p.alphabet_style) && /alphabet|keycap/i.test(p.name))
    : products;
  const filtered = stockProducts
    .filter(
      (p) =>
        (!category || p.category_id === category) &&
        p.name.toLowerCase().includes(search.toLowerCase()) &&
        (stockView !== "out" || shownStock(p) <= 0) &&
        (stockView !== "count" || needsCount(p)),
    )
    .sort((a, b) =>
      stockView === "lowest"
        ? shownStock(a) - shownStock(b) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const save = async () => {
    const entered = Number(quantity);
    const current = selectedLetter
      ? (selected?.alphabet_style?.letters.find((item) => item.letter === selectedLetter)?.quantity_on_hand ?? 0)
      : (selectedVariant?.quantity_on_hand ?? selected?.quantity_on_hand ?? 0);
    const delta = mode === "set" ? entered - current : mode === "damage" ? -entered : entered;
    const amount = Math.abs(delta);
    if (!selected || !Number.isInteger(entered) || entered < 0 || (mode !== "set" && entered === 0))
      return Alert.alert(
        "Check quantity",
        mode === "set" ? "Type how many items are there now." : "Enter a whole number greater than zero.",
      );
    if (mode === "set" && delta === 0) return Alert.alert("Count already correct", `Stock is already ${current}.`);
    const movementType: "stock_in" | "damage" = delta < 0 ? "damage" : "stock_in";
    let error: { message: string } | null = null;
    if (selectedLetter && selected.alphabet_style) {
      const letterResult = await supabase.rpc("record_alphabet_inventory_movement", {
          p_location_id: locationId,
          p_style_id: selected.alphabet_style.id,
          p_letter: selectedLetter,
          p_type: movementType,
          p_quantity: amount,
          p_note: mode === "set" ? `Actual letter count set to ${entered}` : mode === "damage" ? "Damaged or lost alphabet letter" : "Alphabet stock received",
        });
      error = letterResult.error;
      if (!error && selected.name.startsWith("Extra Alphabet -")) {
        const totalResult = await supabase.rpc("record_inventory_movement", {
          p_location_id: locationId,
          p_product_id: selected.id,
          p_type: movementType,
          p_quantity: amount,
          p_note: mode === "set" ? `Actual alphabet count adjusted to ${entered}` : mode === "damage" ? "Damaged or lost alphabet total" : "Alphabet total stock received",
        });
        error = totalResult.error;
      }
    } else if (selectedVariant) {
      const variantResult = await supabase.rpc("record_variant_inventory_movement", {
          p_location_id: locationId,
          p_variant_id: selectedVariant.id,
          p_type: movementType,
          p_quantity: amount,
          p_note:
            mode === "set" ? `Actual choice count set to ${entered}` : mode === "damage" ? "Damaged or lost product choice" : "Choice stock received",
        });
      error = variantResult.error;
    } else {
      const productResult = await supabase.rpc("record_inventory_movement", {
          p_location_id: locationId,
          p_product_id: selected.id,
          p_type: movementType,
          p_quantity: amount,
          p_note: mode === "set" ? `Actual count set to ${entered}` : mode === "damage" ? "Damaged or lost product" : "Stock received",
        });
      error = productResult.error;
    }
    if (error) return Alert.alert("Stock not saved", error.message);
    setSelected(null);
    setSelectedVariant(null);
    setSelectedLetter(null);
    setQuantity("");
    await onSaved();
    Alert.alert(
      "Stock updated",
      mode === "set"
        ? `Actual stock is now ${entered}.`
        : mode === "damage"
          ? `${amount} damaged or lost recorded.`
          : `${amount} received into stock.`,
      [
        { text: "Back to stock", onPress: onBack },
        { text: "Update another" },
      ],
    );
  };
  if (
    selected?.name.startsWith("Extra Alphabet -") &&
    selected.alphabet_style &&
    !selectedLetter
  )
    return (
      <View style={s.flex}>
        <Back title={`Choose ${selected.alphabet_style.name} letter`} onPress={() => setSelected(null)} />
        <FlatList
          data={selected.alphabet_style.letters}
          keyExtractor={(item) => item.letter}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable style={s.listRow} onPress={() => setSelectedLetter(item.letter)}>
              <View style={s.variantLetter}><Text style={s.variantLetterText}>{item.letter}</Text></View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>Letter {item.letter}</Text>
                <Text style={s.rowHelp}>{item.needs_stock_count ? "Please count this stock" : `${item.quantity_on_hand} in stock`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.teal} />
            </Pressable>
          )}
        />
      </View>
    );
  if (selected && selected.variants.length && !selectedVariant)
    return (
      <View style={s.flex}>
        <Back
          title={`Choose ${selected.variant_label ?? "option"}`}
          onPress={() => setSelected(null)}
        />
        <Text style={s.subtitle}>{selected.name}</Text>
        <FlatList
          data={selected.variants}
          keyExtractor={(variant) => variant.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable
              style={s.listRow}
              onPress={() => setSelectedVariant(item)}
            >
              <View style={s.variantLetter}>
                <Text style={s.variantLetterText}>{item.name}</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.rowTitle}>
                  {selected.variant_label ?? "Choice"} {item.name}
                </Text>
                <Text style={s.rowHelp}>
                  {item.quantity_on_hand} in stock
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.teal} />
            </Pressable>
          )}
        />
      </View>
    );
  if (selected)
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <Back
          title="Update stock"
          onPress={() => {
            if (selectedVariant) setSelectedVariant(null);
            else if (selectedLetter) setSelectedLetter(null);
            else setSelected(null);
          }}
        />
        <View style={s.editCard}>
          <View style={s.editHeading}>
            <View style={s.productMiniIcon}>
              <Ionicons
                name={productIcon(
                  selected.name,
                  categoryName(selected.category_id),
                )}
                size={27}
                color={C.accent}
              />
            </View>
            <View style={s.flex}>
              <Text style={s.editName}>{selected.name}</Text>
              {selectedVariant ? (
                <Text style={s.variantChosen}>
                  {selected.variant_label ?? "Choice"}: {selectedVariant.name}
                </Text>
              ) : selectedLetter ? (
                <Text style={s.variantChosen}>
                  {selected.alphabet_style?.name} letter {selectedLetter}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={s.stockBig}>
            {selectedLetter
              ? (selected.alphabet_style?.letters.find((item) => item.letter === selectedLetter)?.quantity_on_hand ?? 0)
              : (selectedVariant?.quantity_on_hand ?? selected.quantity_on_hand)}
          </Text>
          <Text style={s.stockLabel}>in stock</Text>
          <Text style={s.section}>What do you want to do?</Text>
          <View style={s.stockActionChoices}>
            <Choice
              label="Add stock"
              icon="add-circle-outline"
              selected={mode === "stock_in"}
              onPress={() => setMode("stock_in")}
            />
            <Choice
              label="Change stock number"
              icon="keypad-outline"
              selected={mode === "set"}
              onPress={() => setMode("set")}
            />
            <Choice
              label="Remove stock"
              icon="warning-outline"
              selected={mode === "damage"}
              danger
              onPress={() => setMode("damage")}
            />
          </View>
          <Label>{mode === "set" ? "Count the items. How many do you have now?" : "How many?"}</Label>
          <TextInput
            style={s.qtyInput}
            keyboardType="number-pad"
            placeholder="0"
            value={quantity}
            onChangeText={setQuantity}
            autoFocus
          />
          <BigButton
            label={mode === "set" ? "Save new number" : mode === "damage" ? "Remove from stock" : "Add stock"}
            icon={mode === "damage" ? "warning-outline" : "add-circle-outline"}
            color={SECTION.stock.color}
            onPress={save}
            danger={mode === "damage"}
          />
        </View>
      </ScrollView>
    );
  return (
    <View style={s.flex}>
      <FlatList
        key={`stock-${stockColumns}`}
        data={filtered}
        numColumns={stockColumns}
        columnWrapperStyle={stockColumns === 2 ? s.stockGridRow : undefined}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.stockListContent}
        showsVerticalScrollIndicator
        ListHeaderComponent={(
          <View style={s.stockListHeader}>
            <Back title={alphabetOnly ? "A–Z letter stock" : "Stock"} onPress={onBack} />
            <View style={[s.stockPageHeading, s.stockPageHero, width < 560 && s.stockPageHeadingMobile]}>
              <View style={s.flex}>
                <Text style={s.pageTitle}>{alphabetOnly ? "Update A–Z letters" : "Check and update stock"}</Text>
                <Text style={s.subtitle}>{alphabetOnly ? "Choose a keycap design, then tap a letter to change its count." : "Tap a product to add stock or correct its count."}</Text>
              </View>
              {!alphabetOnly ? <Pressable accessibilityRole="button" accessibilityLabel="Manage products" style={s.stockManageButton} onPress={() => onManageProducts()}>
                <Ionicons name="create-outline" size={20} color={C.white} />
                <Text style={s.stockManageButtonText}>Manage products</Text>
              </Pressable> : null}
            </View>
            {alphabetOnly ? (
              <View style={s.clickerLogicNote}>
                <Ionicons name="information-circle-outline" size={21} color={SECTION.stock.color}/>
                <Text style={s.clickerLogicText}>Universal and Character are shared A–Z stock pools. Every clicker sale removes its selected letters from the matching pool automatically.</Text>
              </View>
            ) : null}
            <Search value={search} onChange={setSearch} />
            <View style={[s.stockFilters, width >= 900 && s.stockFiltersDesktop]}>
              {!alphabetOnly ? <View style={s.stockFilterGroup}>
                <Text style={s.stockFilterLabel}>Category</Text>
                <Pressable style={s.stockCategoryPicker} onPress={() => setCategoryOpen((open) => !open)}>
                  <View style={s.stockCategoryPickerIcon}><Ionicons name={category ? categoryIcon(categoryName(category)) : "apps"} size={21} color={C.accent} /></View>
                  <Text style={s.stockCategoryPickerText} numberOfLines={1}>{category ? categoryName(category) : "All products"}</Text>
                  <Text style={s.stockCategoryChange}>Change</Text>
                  <Ionicons name={categoryOpen ? "chevron-up" : "chevron-down"} size={20} color={C.muted} />
                </Pressable>
                {categoryOpen ? (
                  <View style={s.categoryMenu}>
                    <Pressable style={[s.categoryMenuRow,!category&&s.categoryMenuRowOn]} onPress={() => { setCategory(null); setCategoryOpen(false); }}><Ionicons name="apps" size={20} color={C.ink}/><Text style={s.categoryMenuText}>All products</Text>{!category?<Ionicons name="checkmark" size={20} color={C.accent}/>:null}</Pressable>
                    {categories.map((c) => <Pressable key={c.id} style={[s.categoryMenuRow,category===c.id&&s.categoryMenuRowOn]} onPress={() => { setCategory(c.id); setCategoryOpen(false); }}><Ionicons name={categoryIcon(c.name)} size={20} color={categoryTone(c.name).color}/><Text style={s.categoryMenuText}>{c.name}</Text>{category===c.id?<Ionicons name="checkmark" size={20} color={C.accent}/>:null}</Pressable>)}
                  </View>
                ) : null}
              </View> : null}
              <View style={s.stockFilterGroup}>
                <Text style={s.stockFilterLabel}>Show stock by</Text>
                <View style={s.stockSortRow}>
                  <Chip label="All" icon="list" selected={stockView === "all"} onPress={() => setStockView("all")} />
                  <Chip label="Low first" icon="arrow-down" selected={stockView === "lowest"} onPress={() => setStockView("lowest")} />
                  <Chip label="Zero" icon="alert-circle" selected={stockView === "out"} onPress={() => setStockView("out")} />
                  <Chip label="Not counted" icon="checkbox-outline" selected={stockView === "count"} onPress={() => setStockView("count")} />
                </View>
              </View>
            </View>
            <Text style={s.stockResultCount}>{filtered.length} {alphabetOnly ? (filtered.length === 1 ? "keycap design" : "keycap designs") : (filtered.length === 1 ? "product" : "products")}</Text>
          </View>
        )}
        ListEmptyComponent={<Empty title="No products match this view" />}
        renderItem={({ item }) => {
          const quantityShown = shownStock(item);
          const low = quantityShown <= item.low_stock_threshold;
          const tone = categoryTone(categoryName(item.category_id));
          return (
            <Pressable
              style={[s.listRow, s.stockProductRow, stockColumns === 2 && s.stockProductRowDesktop, { backgroundColor: C.white, borderLeftColor: tone.color, borderLeftWidth: 4 }]}
              onPress={() => setSelected(item)}
            >
              {item.image_url || placeholderImage(item.name) ? (
                <Image source={item.image_url ? { uri: item.image_url } : placeholderImage(item.name)} style={[s.stockListImage, stockColumns === 2 && s.stockListImageDesktop]} />
              ) : <View style={s.listIcon}>
                <Ionicons
                  name={productIcon(item.name, categoryName(item.category_id))}
                  size={24}
                  color={low ? C.orange : C.accent}
                />
              </View>}
              <View style={s.flex}>
                <Text style={s.rowTitle}>{alphabetOnly ? `${item.alphabet_style?.name ?? "A–Z"} keycaps` : item.name}</Text>
                <Text style={[s.rowHelp, low && s.low]}>
                  {alphabetOnly
                    ? "Tap to update each A–Z letter"
                    : needsCount(item)
                    ? "Please count this stock"
                    : item.variants.length
                      ? `${item.variants.length} choices · tap to see each one`
                      : low
                        ? "Low stock"
                        : "In stock"}
                </Text>
              </View>
              <View style={[s.stockNum, low && s.stockNumLow]}>
                <Text style={[s.stockNumText, low && s.low]}>
                  {quantityShown}
                </Text>
                <Text style={[s.stockNumLabel, low && s.low]}>{alphabetOnly ? "total" : "left"}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.name}`}
                style={s.stockEditButton}
                onPress={(event) => {
                  event.stopPropagation();
                  onManageProducts(item.id);
                }}
              >
                <Ionicons name="pencil-outline" size={19} color={C.accent} />
              </Pressable>
              {stockColumns === 1 ? <Ionicons name="chevron-forward" size={19} color={C.muted} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function PriceList({products,categories,business,onBack,onEdit}:{products:Product[];categories:Category[];business:Business;onBack:()=>void;onEdit:()=>void}) {
  const { width } = useWindowDimensions();
  const grouped=categories.map(category=>({category,items:products.filter(product=>product.category_id===category.id)})).filter(group=>group.items.length);
  const missing=products.filter(product=>product.sale_price===null&&product.regular_price===null).length;
  const printList=()=>{
    if(Platform.OS!=="web") return Alert.alert("Open on a computer","Use Mik on a computer to print the shop price list.");
    const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]!));
    const sections=grouped.map(group=>`<section><h2>${escape(group.category.name)}</h2>${group.items.map(product=>`<div class="row"><span>${escape(product.name)}</span><strong>${(product.sale_price??product.regular_price)!==null?escape(peso(Number(product.sale_price??product.regular_price))):"Price needed"}</strong></div>`).join("")}</section>`).join("");
    const popup=window.open("","_blank","width=900,height=900");
    if(!popup)return Alert.alert("Allow pop-ups","Allow pop-ups for Mik, then try Print price list again.");
    popup.document.write(`<!doctype html><html><head><title>${escape(business.name)} Price List</title><style>body{font-family:Arial,sans-serif;color:#101318;max-width:820px;margin:0 auto;padding:40px}header{border-bottom:3px solid #142C47;padding-bottom:20px;margin-bottom:25px}h1{font-size:34px;margin:0}p{color:#626A73}h2{font-size:18px;margin:25px 0 8px;color:#264A3B}.row{display:flex;justify-content:space-between;gap:25px;padding:10px 0;border-bottom:1px solid #E0E3E7}.row strong{white-space:nowrap}@media print{body{padding:0}}</style></head><body><header><h1>${escape(business.name)}</h1><p>Price List</p></header>${sections}</body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(()=>popup.print(),350);
  };
  return <ScrollView contentContainerStyle={s.scroll}><Back title="Price list" onPress={onBack}/><View style={s.priceListHero}><View style={s.flex}><Text style={s.priceListKicker}>CUSTOMER PRICE LIST</Text><Text style={s.priceListTitle}>Current selling prices</Text><Text style={s.priceListHelp}>Use this at a pop-up or print it for customers.</Text></View><Ionicons name="receipt-outline" size={38} color={C.accent}/></View>{missing?<View style={s.priceWarning}><Ionicons name="alert-circle-outline" size={21} color={C.orange}/><Text style={s.priceWarningText}>{missing} {missing===1?"product needs":"products need"} a price before printing.</Text></View>:null}<View style={[s.priceActions,width<520&&s.priceActionsMobile]}><Pressable style={s.pricePrimary} onPress={printList}><Ionicons name="print-outline" size={21} color={C.white}/><Text style={s.pricePrimaryText}>Print price list</Text></Pressable><Pressable style={s.priceSecondary} onPress={onEdit}><Ionicons name="create-outline" size={21} color={C.dark}/><Text style={s.priceSecondaryText}>Edit product prices</Text></Pressable></View>{grouped.map(group=><View key={group.category.id} style={s.priceSection}><View style={[s.priceSectionMark,{backgroundColor:categoryTone(group.category.name).color}]}/><Text style={s.priceSectionTitle}>{group.category.name}</Text>{group.items.map(product=><View key={product.id} style={s.priceRow}><Text style={s.priceName}>{product.name}</Text><View style={s.priceRight}>{product.sale_price!==null?<Text style={s.priceSaleTag}>SALE</Text>:null}<Text style={[s.priceValue,product.sale_price===null&&product.regular_price===null&&s.priceMissing]}>{product.sale_price!==null||product.regular_price!==null?peso(Number(product.sale_price??product.regular_price)):"Price needed"}</Text></View></View>)}</View>)}</ScrollView>;
}

function More({
  profile,
  business,
  onOpen,
  onGuide,
  deviceUserName,
  onChangeDeviceUser,
  canManageStaff,
}: {
  profile: Profile | null;
  business: Business;
  onOpen: (x: Screen) => void;
  onGuide: () => void;
  deviceUserName: string;
  onChangeDeviceUser?: () => void;
  canManageStaff:boolean;
}) {
  const { width } = useWindowDimensions();
  type MoreTool = { title: string; help: string; icon: Icon; screen?: Screen; guide?: boolean };
  const groups: Array<{ title: string; color: string; soft: string; border: string; tools: MoreTool[] }> = [
    {
      title: "Reports", ...SECTION.records, tools: [
        { icon: "bar-chart-outline", title: "Sales reports", help: "Daily, weekly or monthly", screen: "reports" },
      ],
    },
    {
      title: "Shop & help", ...SECTION.settings, tools: [
        ...(canManageStaff?[{ icon: "people-outline" as Icon, title: "Manage staff", help: "Create accounts and choose their access", screen: "staff" as Screen }]:[]),
        { icon: "storefront-outline", title: "Shop profile & logo", help: business.logo_url ? "Replace this shop's logo" : "Add this shop's logo", screen: "shop" },
        { icon: "help-circle-outline", title: "How to use Mik", help: "Replay the step-by-step guide", guide: true },
        { icon: "chatbox-ellipses-outline", title: "Report a problem", help: "Tell the MIK owner what went wrong", screen: "report_issue" },
      ],
    },
  ];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.pageTitle}>More</Text>
      <Text style={s.subtitle}>Reports, shop settings and help.</Text>
      {groups.map((group) => (
        <View key={group.title} style={s.quickSection}>
          <View style={s.quickSectionHeading}>
            <View style={[s.quickSectionMark,{backgroundColor:group.color}]} />
            <Text style={s.quickSectionTitle}>{group.title}</Text>
          </View>
          <View style={s.quickGrid}>
            {group.tools.map((tool) => (
              <Pressable
                key={tool.title}
                accessibilityRole="button"
                accessibilityLabel={`${tool.title}. ${tool.help}`}
                style={({pressed})=>[s.moreToolCard,{width:width>=920?"31.8%":"48%",backgroundColor:group.soft,borderColor:group.border},pressed&&{opacity:.82,transform:[{scale:.985}]}]}
                onPress={() => tool.guide ? onGuide() : tool.screen && onOpen(tool.screen)}
              >
                <View style={[s.quickIcon,{backgroundColor:group.color}]}><Ionicons name={tool.icon} size={24} color={C.white}/></View>
                <Text style={s.quickTitle}>{tool.title}</Text>
                <Text style={s.quickHelp}>{tool.help}</Text>
                <View style={s.quickGo}><Text style={[s.quickGoText,{color:group.color}]}>Open</Text><Ionicons name="arrow-forward" size={18} color={group.color}/></View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Text style={s.section}>Shop login</Text>
      <View style={s.account}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {((profile?.display_name ?? "S").toLowerCase().includes("sebu") ? "P" : (profile?.display_name ?? "S")[0]).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={s.rowTitle}>
            {(profile?.display_name ?? "Shop user").toLowerCase().includes("sebu")
              ? "Pixelbug"
              : profile?.display_name ?? "Shop user"}
          </Text>
          <Text style={s.rowHelp}>This login belongs to this shop only</Text>
        </View>
      </View>
      {onChangeDeviceUser?<Pressable style={s.deviceNameButton} onPress={onChangeDeviceUser}><Ionicons name="person-outline" size={21} color={C.accent}/><View style={s.flex}><Text style={s.rowTitle}>Using MIK as {deviceUserName}</Text><Text style={s.rowHelp}>Change the name saved on this device</Text></View><Ionicons name="chevron-forward" size={20} color={C.muted}/></Pressable>:null}
      <Pressable style={s.signout} onPress={() => supabase.auth.signOut()}>
        <Ionicons name="log-out-outline" size={22} color={C.red} />
        <Text style={s.signoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

type IssueReport = {
  id: string;
  business_id: string;
  category: string;
  message: string;
  status: "open" | "resolved";
  created_at: string;
  image_url: string | null;
  business: { name: string } | null;
};

function ReportIssue({businessId,onBack}:{businessId:string;onBack:()=>void}) {
  const choices = ["Sales", "Stock", "Orders", "Account", "Feedback / change", "Something else"];
  const [category,setCategory] = useState(choices[0]);
  const [message,setMessage] = useState("");
  const [sending,setSending] = useState(false);
  const [photo,setPhoto] = useState<{uri:string;width:number;height:number}|null>(null);
  const choosePhoto=async()=>{
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted)return Alert.alert("Photo access needed","Allow MIK to choose a screenshot or photo.");
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:1});
    if(!result.canceled){const asset=result.assets[0];setPhoto({uri:asset.uri,width:asset.width,height:asset.height});}
  };
  const send = async () => {
    const clean = message.trim();
    if (clean.length < 5) return Alert.alert("Tell us what happened", "Write a short description so we know what to check.");
    setSending(true);
    let image_url:string|null=null;
    if(photo){
      try{
        const resized=await ImageManipulator.manipulateAsync(photo.uri,[photo.width>=photo.height?{resize:{width:1200}}:{resize:{height:1200}}],{compress:.72,format:ImageManipulator.SaveFormat.JPEG});
        const response=await fetch(resized.uri);if(!response.ok)throw new Error("Photo could not be read");
        const path=`${businessId}/issues/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
        const {error:uploadError}=await supabase.storage.from("product-images").upload(path,await response.arrayBuffer(),{contentType:"image/jpeg"});
        if(uploadError)throw uploadError;
        image_url=supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }catch(error:any){setSending(false);return Alert.alert("Photo not uploaded",error?.message??"Please try another image.");}
    }
    const { data, error } = await supabase.from("issue_reports").insert({ business_id: businessId, category, message: clean, image_url }).select("id").single();
    setSending(false);
    if (error) return Alert.alert("Report not sent", error.message);
    if (data?.id) await supabase.functions.invoke("notify-issue-report", { body: { issueId: data.id } });
    setMessage("");
    setPhoto(null);
    Alert.alert("Sent to Esther", "Esther can now see your message and will review it.", [{text:"Done",onPress:onBack}]);
  };
  return <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
    <Back title="Help & feedback" onPress={onBack}/>
    <View style={s.issueIntro}><View style={s.issueIntroIcon}><Ionicons name="chatbox-ellipses-outline" size={27} color={C.white}/></View><View style={s.flex}><Text style={s.issueIntroTitle}>How can MIK help?</Text><Text style={s.issueIntroHelp}>Report a problem, share feedback or request a change. Esther will receive and review your message.</Text></View></View>
    <Text style={s.issueStep}>1 · What is this about?</Text>
    <View style={s.issueChoices}>{choices.map(choice=><Pressable key={choice} style={[s.issueChoice,category===choice&&s.issueChoiceOn]} onPress={()=>setCategory(choice)}><Text style={[s.issueChoiceText,category===choice&&s.issueChoiceTextOn]}>{choice}</Text></Pressable>)}</View>
    <Text style={s.issueStep}>2 · What would you like to tell Esther?</Text>
    <TextInput style={[s.input,s.issueMessage]} multiline textAlignVertical="top" value={message} onChangeText={setMessage} placeholder="Example: Clear Sale did not work, or I would like a new feature for…" maxLength={1000}/>
    <Text style={s.issueStep}>3 · Add a photo (optional)</Text>
    <Pressable style={s.issuePhotoButton} onPress={()=>void choosePhoto()}><Ionicons name="camera-outline" size={22} color={C.accent}/><View style={s.flex}><Text style={s.rowTitle}>{photo?"Change photo":"Add screenshot or photo"}</Text><Text style={s.rowHelp}>{photo?"Photo ready to send":"This can help us understand the problem"}</Text></View>{photo?<Image source={{uri:photo.uri}} style={s.issuePhotoThumb}/>:<Ionicons name="add" size={22} color={C.muted}/>}</Pressable>
    <Text style={s.issuePrivacy}>Do not include passwords or payment account numbers.</Text>
    <BigButton label={sending?"Sending…":"Send report"} icon="send-outline" color={C.accent} onPress={()=>void send()} disabled={sending}/>
  </ScrollView>;
}

function OwnerIssueReports({onBack}:{onBack:()=>void}) {
  const [items,setItems] = useState<IssueReport[]>([]);
  const [loading,setLoading] = useState(true);
  const [showResolved,setShowResolved] = useState(false);
  const load = useCallback(async()=>{
    setLoading(true);
    let query = supabase.from("issue_reports").select("id,business_id,category,message,status,created_at,image_url,business:businesses(name)").order("created_at",{ascending:false});
    if(!showResolved) query=query.eq("status","open");
    const {data,error}=await query;
    if(error) Alert.alert("Reports not loaded",error.message);
    setItems((data??[]) as unknown as IssueReport[]);setLoading(false);
  },[showResolved]);
  useEffect(()=>{void load();},[load]);
  const resolve = async(item:IssueReport)=>{
    const {error}=await supabase.from("issue_reports").update({status:item.status==="open"?"resolved":"open",resolved_at:item.status==="open"?new Date().toISOString():null}).eq("id",item.id);
    if(error)return Alert.alert("Report not updated",error.message);
    await load();
  };
  return <SafeAreaView style={s.app}><View style={s.adminTop}><Pressable accessibilityRole="button" accessibilityLabel="Back to owner account" style={s.backButton} onPress={onBack}><Ionicons name="arrow-back" size={23} color={C.ink}/></Pressable><View style={s.flex}><Text style={s.kicker}>OWNER ONLY</Text><Text style={s.shopName}>Problem reports</Text></View></View><ScrollView contentContainerStyle={s.adminPage}>
    <Pressable style={s.issueToggle} onPress={()=>setShowResolved(v=>!v)}><Ionicons name={showResolved?"eye-off-outline":"eye-outline"} size={20} color={C.accent}/><Text style={s.issueToggleText}>{showResolved?"Hide completed reports":"Show completed reports"}</Text></Pressable>
    {loading ? (
      <ActivityIndicator color={C.green}/>
    ) : items.length ? (
      items.map(item=><View key={item.id} style={s.issueOwnerCard}><View style={s.issueOwnerTop}><View style={s.flex}><Text style={s.issueOwnerShop}>{item.business?.name??"Unknown shop"}</Text><Text style={s.issueOwnerMeta}>{item.category} · {friendlyDateTime(item.created_at)}</Text></View><View style={[s.statusPill,item.status==="resolved"&&s.statusPillPaused]}><Text style={[s.statusText,item.status==="resolved"&&s.statusTextPaused]}>{item.status==="open"?"OPEN":"DONE"}</Text></View></View><Text style={s.issueOwnerMessage}>{item.message}</Text>{item.image_url?<Image source={{uri:item.image_url}} style={s.issueOwnerImage} resizeMode="contain"/>:null}<Pressable style={s.issueResolve} onPress={()=>void resolve(item)}><Ionicons name={item.status==="open"?"checkmark-circle-outline":"refresh-outline"} size={20} color={C.accent}/><Text style={s.issueResolveText}>{item.status==="open"?"Mark as completed":"Reopen report"}</Text></Pressable></View>)
    ) : (
      <Empty title={showResolved?"No problem reports yet":"No open problems"}/>
    )}
  </ScrollView></SafeAreaView>;
}

function ShopProfile({
  business,
  onBack,
  onSaved,
}: {
  business: Business;
  onBack: () => void;
  onSaved: (logoUrl: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const chooseLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert("Photo access needed", "Allow Mik to choose a shop logo from this device.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled) return;
    setSaving(true);
    try {
      const asset = result.assets[0];
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [asset.width >= asset.height ? { resize: { width: 900 } } : { resize: { height: 900 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
      );
      const response = await fetch(resized.uri);
      if (!response.ok) throw new Error("Logo could not be read");
      const path = `${business.id}/shop/logo.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, await response.arrayBuffer(), { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      const logo_url = `${supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error: saveError } = await supabase.from("businesses").update({ logo_url }).eq("id", business.id);
      if (saveError) throw saveError;
      onSaved(logo_url);
      Alert.alert("Shop logo updated", "The new logo now appears in this shop's header.");
    } catch (error: any) {
      Alert.alert("Logo not saved", error?.message ?? "Please try another image.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Back title="Shop profile" onPress={onBack} />
      <Text style={s.subtitle}>This logo belongs only to {business.name}.</Text>
      <View style={s.editCard}>
        <View style={s.shopLogoPreview}>
          <Image
            source={business.logo_url ? { uri: business.logo_url } : require("../assets/mik-app-icon.png")}
            style={s.shopLogoPreviewImage}
          />
        </View>
        <Text style={s.shopProfileName}>{business.name}</Text>
        <Text style={s.centerHelp}>Choose a clear square logo. Mik will resize it automatically.</Text>
        <BigButton
          label={saving ? "Saving logo…" : business.logo_url ? "Replace shop logo" : "Upload shop logo"}
          icon="image-outline"
          color={SECTION.settings.color}
          onPress={chooseLogo}
          disabled={saving}
        />
      </View>
    </ScrollView>
  );
}

type ActivityLog = {
  id: number;
  business_id: string | null;
  actor_name: string;
  action: string;
  summary: string;
  details: Record<string, any>;
  created_at: string;
  business: { name: string } | null;
};

function activityDetail(item: ActivityLog) {
  if (item.action === "login") {
    const name = item.details?.device_user_name;
    return name ? `Signed in as ${name}` : "Signed in";
  }
  if (item.action !== "product_updated") return "";
  const before = item.details?.before ?? {};
  const after = item.details?.after ?? {};
  const changes: string[] = [];
  if (before.name !== after.name) changes.push(`Name: ${before.name} → ${after.name}`);
  if (before.regular_price !== after.regular_price) changes.push(`Price: ${peso(Number(before.regular_price ?? 0))} → ${peso(Number(after.regular_price ?? 0))}`);
  if (before.sale_price !== after.sale_price) changes.push(`Sale price: ${before.sale_price == null ? "none" : peso(Number(before.sale_price))} → ${after.sale_price == null ? "none" : peso(Number(after.sale_price))}`);
  return changes.join(" · ") || "Product details changed";
}

function activityIcon(action: string): Icon {
  if (action.startsWith("sale_")) return "receipt-outline";
  if (action.startsWith("product_")) return "cube-outline";
  if (action.startsWith("event_")) return "calendar-outline";
  if (action === "stock_changed") return "layers-outline";
  if (action.startsWith("order_")) return "clipboard-outline";
  if (action === "login") return "log-in-outline";
  if (action.includes("password") || action.includes("passcode")) return "shield-checkmark-outline";
  return "storefront-outline";
}

function OwnerActivityLog({ shops, onBack }: { shops: AdminShop[]; onBack: () => void }) {
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState("all");
  const [kind, setKind] = useState("all");
  useEffect(() => {
    setLoading(true);
    supabase
      .from("activity_logs")
      .select("id,business_id,actor_name,action,summary,details,created_at,business:businesses(name)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) Alert.alert("Activity not loaded", error.message);
        setItems((data ?? []) as unknown as ActivityLog[]);
        setLoading(false);
      });
  }, []);
  const visible = items.filter((item) => {
    const shopOk = shopId === "all" || item.business_id === shopId;
    const kindOk = kind === "all" || (kind === "sales" ? item.action.startsWith("sale_") : kind === "products" ? item.action.startsWith("product_") || item.action === "stock_changed" : kind === "orders" ? item.action.startsWith("order_") : kind === "security" ? item.action.includes("password") || item.action.includes("passcode") : item.action === "login");
    return shopOk && kindOk;
  });
  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <View style={s.adminTop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to owner account" style={s.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={23} color={C.ink} />
        </Pressable>
        <View style={s.flex}><Text style={s.kicker}>OWNER ONLY</Text><Text style={s.shopName}>Shop activity</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.adminPage}>
        <Text style={s.subtitle}>See what changed, who did it, and when.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.activityFilters}>
          <Chip label="All shops" selected={shopId === "all"} onPress={() => setShopId("all")} />
          {shops.map((shop) => <Chip key={shop.id} label={shop.name} selected={shopId === shop.id} onPress={() => setShopId(shop.id)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.activityFilters}>
          {[{id:"all",label:"Everything"},{id:"sales",label:"Sales"},{id:"products",label:"Products & stock"},{id:"orders",label:"Orders"},{id:"login",label:"Logins"},{id:"security",label:"Security"}].map((filter) => (
            <Pressable accessibilityRole="button" key={filter.id} style={[s.activityFilter,kind===filter.id&&s.activityFilterOn]} onPress={() => setKind(filter.id)}>
              <Text pointerEvents="none" style={[s.activityFilterText,kind===filter.id&&s.activityFilterTextOn]}>{filter.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {loading ? <ActivityIndicator size="large" color={C.green} /> : visible.length ? visible.map((item) => {
          const detail = activityDetail(item);
          return (
          <View key={item.id} style={s.activityRow}>
            <View style={s.activityIcon}><Ionicons name={activityIcon(item.action)} size={21} color={C.green} /></View>
            <View style={s.flex}>
              <Text style={s.activitySummary}>{item.summary}</Text>
              {detail ? <Text style={s.activityDetail}>{detail}</Text> : null}
              <Text style={s.activityMeta}>{item.business?.name ?? "MIK owner account"} · {item.actor_name}</Text>
              <Text style={s.activityTime}>{new Date(item.created_at).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}</Text>
            </View>
          </View>
        )}) : <View style={s.empty}><Ionicons name="time-outline" size={32} color={C.green} /><Text style={s.activityEmptyTitle}>No activity found</Text><Text style={s.activityEmptyText}>Try another shop or activity type.</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

type GuideFlow = { icon: Icon; label: string };
type GuideStep = { title: string; body: string; icon: Icon; flow: GuideFlow[] };
const guideSteps: GuideStep[] = [
  {
    title: "Welcome to Mik",
    body: "Home groups every tool by task. Tap Home at any time to find sales, stock, production, records, settings and support.",
    icon: "home",
    flow: [
      { icon: "home-outline", label: "Home" },
      { icon: "cart-outline", label: "Sell" },
      { icon: "clipboard-outline", label: "Orders" },
      { icon: "cube-outline", label: "Stock" },
    ],
  },
  {
    title: "Choose how you are selling",
    body: "Shop Sale is the normal checkout and asks for keycap letters. Event Sale is faster and skips letters, so you count the A–Z keycaps after the event.",
    icon: "storefront",
    flow: [
      { icon: "cart-outline", label: "Sell" },
      { icon: "storefront-outline", label: "Shop Sale" },
      { icon: "flash-outline", label: "Event Sale" },
    ],
  },
  {
    title: "Make and finish a sale",
    body: "Choose a category, tap the product photo and select any required choices. Review quantities, choose Cash or GCash, then confirm payment.",
    icon: "cart",
    flow: [
      { icon: "cart-outline", label: "Sell" },
      { icon: "image-outline", label: "Product" },
      { icon: "receipt-outline", label: "Review" },
      { icon: "cash-outline", label: "Pay" },
    ],
  },
  {
    title: "Keep stock and products ready",
    body: "Stock shows what is low or empty. Update finished products and A–Z keycaps separately. Products & prices lets you add, edit or remove products and categories.",
    icon: "cube",
    flow: [
      { icon: "cube-outline", label: "Stock" },
      { icon: "text-outline", label: "A–Z keycaps" },
      { icon: "pricetags-outline", label: "Products" },
    ],
  },
  {
    title: "Track outside orders",
    body: "Record Facebook, online, referral or walk-in work. Printing starts after 50% payment. Mark the order ready, collect final payment, then confirm collection or delivery.",
    icon: "clipboard",
    flow: [
      { icon: "clipboard-outline", label: "Orders" },
      { icon: "card-outline", label: "Payment" },
      { icon: "construct-outline", label: "Print" },
      { icon: "checkmark-circle-outline", label: "Collect" },
    ],
  },
  {
    title: "Manage 3D printing work",
    body: "Use Print Queue for jobs, Printers for equipment condition, Filaments for materials, and Price calculator for a simple selling-price estimate.",
    icon: "layers",
    flow: [
      { icon: "layers-outline", label: "Print Queue" },
      { icon: "hardware-chip-outline", label: "Printers" },
      { icon: "color-filter-outline", label: "Filaments" },
    ],
  },
  {
    title: "See results and plan ahead",
    body: "Sales Today shows receipts. View all sales gives daily, weekly, monthly or exact-date reports. Calendar keeps events and reminders in one place.",
    icon: "bar-chart",
    flow: [
      { icon: "today-outline", label: "Today" },
      { icon: "bar-chart-outline", label: "All sales" },
      { icon: "calendar-outline", label: "Calendar" },
    ],
  },
  {
    title: "Fix records and get help",
    body: "Add a missed sale using its original date. Cancel a mistaken sale to restore its stock. If something is not working, send a problem report with an optional photo.",
    icon: "help-circle",
    flow: [
      { icon: "calendar-outline", label: "Missed sale" },
      { icon: "return-up-back-outline", label: "Cancel sale" },
      { icon: "chatbox-ellipses-outline", label: "Report" },
    ],
  },
  {
    title: "Export for Excel",
    body: "Sales reports and Orders can be exported for Excel. Choose the period or list first, then save or share the file.",
    icon: "download",
    flow: [
      { icon: "calendar-outline", label: "Period" },
      { icon: "download-outline", label: "Export" },
      { icon: "share-social-outline", label: "Save or share" },
    ],
  },
];

function WhatsNewModal({visible,onClose}:{visible:boolean;onClose:()=>void}){
  const updates=[
    {icon:"calendar-number-outline" as Icon,title:"Earlier sales are clearer",text:"Use the current price or enter the price charged on that date."},
    {icon:"archive-outline" as Icon,title:"Past orders are easier to record",text:"Mark an older order as still in progress or already completed."},
    {icon:"people-outline" as Icon,title:"Account visibility improved",text:"Owners can see shop owners, shop logins and staff more clearly."},
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><SafeAreaView style={s.whatsNewOverlay}><View style={s.whatsNewCard}>
    <View style={s.whatsNewIcon}><Ionicons name="sparkles" size={28} color={C.white}/></View><Text style={s.whatsNewKicker}>WHAT'S NEW IN MIK</Text><Text style={s.whatsNewTitle}>Small improvements, easier days.</Text><Text style={s.whatsNewDate}>{friendlyLocalDate()}</Text>
    <View style={s.whatsNewList}>{updates.map(item=><View key={item.title} style={s.whatsNewRow}><View style={s.whatsNewRowIcon}><Ionicons name={item.icon} size={21} color={C.green}/></View><View style={s.flex}><Text style={s.whatsNewRowTitle}>{item.title}</Text><Text style={s.whatsNewRowText}>{item.text}</Text></View></View>)}</View>
    <BigButton label="Continue to MIK" icon="arrow-forward" onPress={onClose}/>
  </View></SafeAreaView></Modal>;
}

function GuideModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);
  const item = guideSteps[step];
  const last = step === guideSteps.length - 1;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.guideOverlay}>
        <View style={s.guideCard}>
          <View style={s.guideHeader}>
            <Text style={s.guideKicker}>MIK GUIDE</Text>
            <Text style={s.guideCount}>
              {step + 1} of {guideSteps.length}
            </Text>
            <Pressable
              accessibilityLabel="Close guide"
              style={s.guideClose}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={C.muted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.guideContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.guideHero}>
              <Ionicons name={item.icon} size={48} color={C.white} />
            </View>
            <Text style={s.guideTitle}>{item.title}</Text>
            <Text style={s.guideBody}>{item.body}</Text>
            <View style={s.guideFlow}>
              {item.flow.map((part, index) => (
                <View key={`${part.label}-${index}`} style={s.guideFlowPart}>
                  {index > 0 ? (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={C.muted}
                    />
                  ) : null}
                  <View style={s.guideFlowItem}>
                    <Ionicons name={part.icon} size={25} color={C.green} />
                    <Text style={s.guideFlowLabel}>{part.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={s.guideDots}>
            {guideSteps.map((_, index) => (
              <View
                key={index}
                style={[s.guideDot, index === step && s.guideDotOn]}
              />
            ))}
          </View>
          <View style={s.guideActions}>
            {step > 0 ? (
              <Pressable
                style={s.guideBack}
                onPress={() => setStep((n) => n - 1)}
              >
                <Ionicons name="arrow-back" size={21} color={C.dark} />
                <Text style={s.guideBackText}>Back</Text>
              </Pressable>
            ) : (
              <Pressable style={s.guideBack} onPress={onClose}>
                <Text style={s.guideBackText}>Skip</Text>
              </Pressable>
            )}
            <Pressable
              style={s.guideNext}
              onPress={() => (last ? onClose() : setStep((n) => n + 1))}
            >
              <Text style={s.guideNextText}>
                {last ? "Start using Mik" : "Next"}
              </Text>
              <Ionicons
                name={last ? "checkmark-circle" : "arrow-forward"}
                size={22}
                color={C.white}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
function Back({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={s.back}>
      <Pressable style={s.backButton} onPress={onPress}>
        <Ionicons name="arrow-back" size={25} color={C.ink} />
      </Pressable>
      <Text style={s.backTitle}>{title}</Text>
    </View>
  );
}
function Step({ number, children }: { number: string; children: ReactNode }) {
  return (
    <View style={s.step}>
      <View style={s.stepCircle}>
        <Text style={s.stepNumber}>{number}</Text>
      </View>
      <Text style={s.stepText}>{children}</Text>
    </View>
  );
}
function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (x: string) => void;
}) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={22} color={C.muted} />
      <TextInput
        style={s.searchInput}
        placeholder="Search product"
        value={value}
        onChangeText={onChange}
      />
      {value ? (
        <Pressable onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={24} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
function Chip({
  label,
  icon,
  selected,
  onPress,
  tone,
}: {
  label: string;
  icon?: Icon;
  selected: boolean;
  onPress: () => void;
  tone?: { color: string; soft: string };
}) {
  const chipTone = tone ?? { color: C.accent, soft: C.white };
  return (
    <Pressable
      style={[
        s.chip,
        { borderColor: chipTone.color, backgroundColor: selected ? chipTone.color : chipTone.soft },
      ]}
      onPress={onPress}
    >
      {icon ? (
        <Ionicons name={icon} size={19} color={selected ? C.white : chipTone.color} />
      ) : null}
      <Text style={[s.chipText, { color: selected ? C.white : chipTone.color }]}>{label}</Text>
    </Pressable>
  );
}
function Quantity({
  value,
  minus,
  plus,
}: {
  value: number;
  minus: () => void;
  plus: () => void;
}) {
  return (
    <View style={s.quantity}>
      <Pressable style={s.qtyButton} onPress={minus}>
        <Ionicons name="remove" size={24} color={C.dark} />
      </Pressable>
      <Text style={s.qtyNumber}>{value}</Text>
      <Pressable style={s.qtyButton} onPress={plus}>
        <Ionicons name="add" size={24} color={C.dark} />
      </Pressable>
    </View>
  );
}
function Choice({
  label,
  icon,
  selected,
  danger,
  onPress,
}: {
  label: string;
  icon: Icon;
  selected: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        s.choice,
        selected && s.choiceOn,
        selected && danger && s.choiceDanger,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={27}
        color={selected ? (danger ? C.red : C.green) : C.muted}
      />
      <Text
        style={[s.choiceText, selected && { color: danger ? C.red : C.dark }]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons
          name="checkmark-circle"
          size={21}
          color={danger ? C.red : C.green}
        />
      ) : null}
    </Pressable>
  );
}
function BigButton({
  label,
  onPress,
  disabled,
  icon,
  danger,
  color,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: Icon;
  danger?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      style={[
        s.bigButton,
        color && { backgroundColor: color },
        danger && { backgroundColor: C.red },
        disabled && s.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon ? <Ionicons name={icon} size={23} color={C.white} /> : null}
      <Text style={s.bigButtonText}>{label}</Text>
    </Pressable>
  );
}
function Stat({
  label,
  value,
  icon,
  color = C.green,
}: {
  label: string;
  value: string;
  icon: Icon;
  color?: string;
}) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
  );
}
function Menu({
  icon,
  title,
  help,
  color = C.green,
  soft = C.soft,
  onPress,
}: {
  icon: Icon;
  title: string;
  help: string;
  color?: string;
  soft?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.menu} onPress={onPress}>
      <View style={[s.menuIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={27} color={color} />
      </View>
      <View style={s.flex}>
        <Text style={s.menuTitle}>{title}</Text>
        <Text style={s.rowHelp}>{help}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={color} />
    </Pressable>
  );
}
function Empty({ title }: { title: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name="checkmark-circle-outline" size={34} color={C.green} />
      <Text style={s.rowTitle}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  app: { flex: 1, backgroundColor: C.cream },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: C.cream,
  },
  login: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: C.white,
  },
  deviceWelcome:{flex:1,alignItems:"center",justifyContent:"center",padding:20,backgroundColor:C.white},
  deviceWelcomeCard:{width:"100%",maxWidth:500,padding:28,alignItems:"center",borderWidth:1,borderColor:C.border,borderRadius:20,backgroundColor:C.white},
  deviceWelcomeLogo:{width:76,height:76,alignSelf:"center",marginBottom:22,borderRadius:18},
  deviceWelcomeKicker:{color:C.muted,fontSize:12,fontWeight:"700",letterSpacing:1.4,textAlign:"center"},
  deviceWelcomeTitle:{marginTop:10,color:C.ink,fontSize:30,lineHeight:36,fontWeight:"700",textAlign:"center"},
  deviceWelcomeFieldLabel:{width:"100%",marginTop:24,marginBottom:7,color:C.ink,fontSize:14,fontWeight:"700",textAlign:"center"},
  deviceWelcomeInput:{width:"100%",textAlign:"center"},
  deviceWelcomeButton:{width:"100%"},
  loginShell:{width:"100%",maxWidth:1040,overflow:"hidden",borderWidth:1,borderColor:C.border,borderRadius:20,backgroundColor:C.white,shadowColor:"#071521",shadowOpacity:.09,shadowRadius:28,shadowOffset:{width:0,height:14},elevation:8},
  loginShellWide:{minHeight:650,flexDirection:"row"},
  loginEditorial:{width:"52%",padding:64,justifyContent:"center",backgroundColor:C.dark},
  loginKicker:{color:C.white,fontSize:12,fontWeight:"700",letterSpacing:4},
  loginBrandLine:{flexDirection:"row",alignItems:"baseline",gap:12},
  loginBrandName:{color:"#BFC9D2",fontSize:12,fontWeight:"500",letterSpacing:2},
  loginMobileName:{marginTop:-5,marginBottom:8,color:C.muted,fontSize:12,fontWeight:"600",letterSpacing:2,textAlign:"center"},
  loginEditorialTitle:{maxWidth:430,marginTop:30,color:C.white,fontSize:52,lineHeight:58,fontWeight:"600",letterSpacing:-1.8},
  loginEditorialBody:{maxWidth:410,marginTop:26,color:"#D7DEE5",fontSize:15,lineHeight:24,fontWeight:"500",letterSpacing:1.2},
  loginCard: {
    width: "100%",
    maxWidth: 520,
    padding: 28,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  loginCardWide:{width:"48%",justifyContent:"center",paddingHorizontal:52,borderWidth:0},
  brandLogo: { width: 220, height: 100, alignSelf: "center" },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  brand: {
    marginTop: 14,
    textAlign: "center",
    color: C.green,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 3,
  },
  loginTitle: {
    marginTop: 4,
    color: C.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    textAlign: "center",
  },
  centerHelp: {
    color: C.muted,
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 16,
  },
  help: { color: C.muted, fontSize: 16, lineHeight: 24 },
  label: {
    marginTop: 18,
    marginBottom: 7,
    color: C.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    minHeight: 56,
    paddingHorizontal: 17,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    color: C.ink,
    backgroundColor: C.white,
    fontSize: 17,
  },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 15,
    color: C.red,
    backgroundColor: C.redSoft,
    fontSize: 15,
    fontWeight: "700",
  },
  setup: {
    flex: 1,
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    justifyContent: "center",
    padding: 26,
    backgroundColor: C.cream,
  },
  kicker: {
    color: C.green,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  guidePreview: {
    minHeight: 48,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  guidePreviewText: { color: C.dark, fontSize: 15, fontWeight: "700" },
  loginCredit: {
    marginTop: 14,
    paddingHorizontal: 20,
    color: "#A8ADB2",
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  top: {
    minHeight: 60,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  shopLogo: { width: 42, height: 42, borderRadius: 13 },
  shopLogoPreview: {
    width: 180,
    height: 180,
    alignSelf: "center",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    backgroundColor: C.white,
  },
  shopLogoPreviewImage: { width: "100%", height: "100%", resizeMode: "contain" },
  shopProfileName: { marginTop: 18, color: C.ink, fontSize: 25, fontWeight: "700", textAlign: "center" },
  shopIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.soft,
  },
  shopName: { color: C.ink, fontSize: 17, fontWeight: "700" },
  locationName: {
    marginTop: 2,
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  ready: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.accentSoft,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  readyText: { color: C.accentDark, fontSize: 12, fontWeight: "700" },
  locationBar: {
    minHeight: 56,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.white,
  },
  locationLabel: { color: C.muted, fontSize: 14, fontWeight: "700" },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  workspace:{flex:1},
  desktopWorkspace:{flexDirection:"column-reverse"},
  desktopContent:{paddingHorizontal:28},
  nav: {
    minHeight: 76,
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  desktopNav:{minHeight:62,paddingHorizontal:22,paddingBottom:0,borderTopWidth:0,borderBottomWidth:1},
  floatingFeedback:{position:"absolute",right:14,bottom:84,zIndex:30,minHeight:44,paddingHorizontal:13,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderWidth:1,borderColor:"rgba(255,255,255,.3)",borderRadius:22,backgroundColor:SECTION.support.color,shadowColor:"#0D1722",shadowOpacity:.2,shadowRadius:10,shadowOffset:{width:0,height:5},elevation:7},
  floatingFeedbackDesktop:{right:24,bottom:22},
  floatingFeedbackText:{color:C.white,fontSize:12,fontWeight:"700"},
  navItem: {
    flex: 1,
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopNavItem:{minHeight:61,flexDirection:"row",gap:8},
  navIcon: {
    width: 42,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  desktopNavIcon:{width:36,height:32},
  navIconOn: { backgroundColor: C.green },
  navText: { marginTop: 2, color: C.muted, fontSize: 12, fontWeight: "700" },
  navTextOn: { color: C.dark, fontWeight: "700" },
  headerHome: {
    minHeight: 42,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: C.green,
  },
  headerHomeText: { color: C.white, fontSize: 14, fontWeight: "700" },
  desktopBrand:{color:C.ink,fontSize:18,fontWeight:"600",letterSpacing:5},
  adminTop: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  adminSignout: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.redSoft,
  },
  adminPage: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 38,
  },
  adminHero: { padding: 20, borderRadius: 20, backgroundColor: C.dark },
  ownerStatsRow:{marginVertical:12,flexDirection:"row",gap:8},
  ownerStatCard:{flex:1,minWidth:0,padding:12,borderWidth:1,borderColor:C.border,borderRadius:13,backgroundColor:C.white},
  ownerStatLabel:{color:C.muted,fontSize:12,fontWeight:"700",letterSpacing:.4},
  ownerStatValue:{marginTop:6,color:C.ink,fontSize:18,fontWeight:"700"},
  ownerExportButton:{minHeight:68,marginBottom:14,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  ownerExportTitle:{color:C.ink,fontSize:15,fontWeight:"700"},
  activityButton:{minHeight:72,marginBottom:14,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  accountSafetyNote:{marginBottom:14,padding:14,flexDirection:"row",alignItems:"flex-start",gap:10,borderWidth:1,borderColor:SECTION.support.border,borderRadius:13,backgroundColor:SECTION.support.soft},
  accountSafetyText:{flex:1,color:C.ink,fontSize:13,lineHeight:19,fontWeight:"600"},
  accountListCard:{marginTop:12,padding:15,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  accountUsername:{marginTop:2,color:C.ink,fontSize:14,fontWeight:"700"},
  accountMetaRow:{marginTop:11,paddingTop:10,flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:8,borderTopWidth:1,borderTopColor:C.border},
  accountRole:{color:SECTION.support.color,fontSize:11,fontWeight:"800",letterSpacing:.8},
  accountManageButton:{minHeight:44,marginTop:10,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:7,borderWidth:1,borderColor:SECTION.stock.border,borderRadius:10,backgroundColor:SECTION.stock.soft},
  accountManageText:{flex:1,color:C.green,fontSize:13,fontWeight:"700"},
  activityButtonIcon:{width:42,height:42,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:C.green},
  activityButtonTitle:{color:C.ink,fontSize:16,fontWeight:"700"},
  activityButtonHelp:{marginTop:2,color:C.muted,fontSize:13},
  activityFilters:{gap:8,paddingVertical:10},
  activityFilter:{minHeight:40,paddingHorizontal:13,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:20,backgroundColor:C.white},
  activityFilterOn:{borderColor:C.green,backgroundColor:C.green},
  activityFilterText:{color:C.ink,fontSize:12,fontWeight:"700"},
  activityFilterTextOn:{color:C.white},
  activityRow:{marginTop:10,padding:14,flexDirection:"row",alignItems:"flex-start",gap:11,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  activityIcon:{width:40,height:40,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:C.accentSoft},
  activitySummary:{color:C.ink,fontSize:15,lineHeight:20,fontWeight:"700"},
  activityDetail:{marginTop:4,color:C.ink,fontSize:12,lineHeight:18},
  activityMeta:{marginTop:5,color:C.muted,fontSize:12,fontWeight:"600"},
  activityTime:{marginTop:3,color:C.muted,fontSize:12},
  activityEmptyTitle:{color:C.ink,fontSize:18,fontWeight:"700"},
  activityEmptyText:{color:C.muted,fontSize:13,textAlign:"center"},
  deviceNameButton:{minHeight:70,marginTop:12,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  issueIntro:{marginBottom:22,padding:16,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:C.border,borderRadius:16,backgroundColor:C.white},
  issueIntroIcon:{width:48,height:48,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:C.accent},
  issueIntroTitle:{color:C.ink,fontSize:18,fontWeight:"700"},
  issueIntroHelp:{marginTop:4,color:C.muted,fontSize:13,lineHeight:19},
  issueStep:{marginTop:16,marginBottom:10,color:C.ink,fontSize:16,fontWeight:"700"},
  issueChoices:{flexDirection:"row",flexWrap:"wrap",gap:8},
  issueChoice:{minHeight:42,paddingHorizontal:14,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:21,backgroundColor:C.white},
  issueChoiceOn:{borderColor:C.accent,backgroundColor:C.accent},
  issueChoiceText:{color:C.ink,fontSize:14,fontWeight:"600"},
  issueChoiceTextOn:{color:C.white},
  issueMessage:{minHeight:150,paddingTop:15},
  issuePhotoButton:{minHeight:74,padding:12,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  issuePhotoThumb:{width:52,height:52,borderRadius:10,resizeMode:"contain",backgroundColor:C.soft},
  issuePrivacy:{marginTop:8,marginBottom:12,color:C.muted,fontSize:12,lineHeight:18},
  issueToggle:{minHeight:48,marginBottom:8,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:C.border,borderRadius:13,backgroundColor:C.white},
  issueToggleText:{color:C.accent,fontSize:14,fontWeight:"700"},
  issueOwnerCard:{marginTop:10,padding:15,borderWidth:1,borderColor:C.border,borderRadius:15,backgroundColor:C.white},
  issueOwnerTop:{flexDirection:"row",alignItems:"flex-start",gap:10},
  issueOwnerShop:{color:C.ink,fontSize:16,fontWeight:"700"},
  issueOwnerMeta:{marginTop:3,color:C.muted,fontSize:12},
  issueOwnerMessage:{marginTop:13,color:C.ink,fontSize:15,lineHeight:22},
  issueOwnerImage:{width:"100%",height:220,marginTop:12,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.soft},
  issueResolve:{minHeight:44,marginTop:14,paddingHorizontal:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderTopWidth:1,borderTopColor:C.border},
  issueResolveText:{color:C.accent,fontSize:14,fontWeight:"700"},
  copyStockChoice:{minHeight:74,marginTop:18,padding:13,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.green,borderRadius:12,backgroundColor:C.white},
  ownerSecurityCard:{marginTop:18,padding:18,borderWidth:1,borderColor:C.border,borderRadius:16,backgroundColor:C.white},
  ownerSecurityHeading:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:8},
  ownerSecurityIcon:{width:48,height:48,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:C.green},
  ownerSecurityTitle:{marginTop:18,color:C.ink,fontSize:17,fontWeight:"700"},
  ownerSecurityDivider:{height:1,marginTop:24,backgroundColor:C.border},
  copyStockChoiceOn:{backgroundColor:C.green},
  copyStockTitle:{color:C.ink,fontSize:14,fontWeight:"700"},
  copyStockHelp:{marginTop:3,color:C.muted,fontSize:12},
  adminShop: {
    minHeight: 82,
    marginBottom: 9,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    backgroundColor: C.white,
  },
  shopAvatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  statusText: {
    color: C.green,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  pageTitle: {
    marginTop: 18,
    color: C.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: { marginTop: 4, color: C.muted, fontSize: 16, lineHeight: 24 },
  scroll: { paddingBottom: 34 },
  quickScroll: { paddingHorizontal: 4, paddingTop: 18, paddingBottom: 34 },
  quickSection:{marginTop:24},
  quickSectionHeading:{flexDirection:"row",alignItems:"center",gap:9},
  quickSectionMark:{width:5,height:22,borderRadius:3},
  quickSectionTitle:{color:C.ink,fontSize:18,fontWeight:"700",letterSpacing:-.25},
  quickSectionHelp:{marginTop:3,color:C.muted,fontSize:13,lineHeight:18},
  quickGrid: {
    marginTop: 11,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  homeReminder:{marginTop:16,minHeight:88,padding:14,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:SECTION.records.border,borderRadius:16,backgroundColor:SECTION.records.soft},
  homeReminderIcon:{width:48,height:48,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:SECTION.records.color},
  homeReminderLabel:{color:SECTION.records.color,fontSize:12,fontWeight:"700",letterSpacing:.8},
  homeReminderTitle:{marginTop:3,color:C.ink,fontSize:17,lineHeight:21,fontWeight:"700"},
  homeReminderMeta:{marginTop:3,color:C.muted,fontSize:12,fontWeight:"600"},
  saleTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  clearSaleButton: {
    minHeight: 42,
    marginTop: 18,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#E8CCD3",
    borderRadius: 10,
    backgroundColor: C.white,
  },
  adminShopTop:{flexDirection:"row",alignItems:"center",gap:11},
  adminShopActions:{paddingTop:10,flexDirection:"row",flexWrap:"wrap",gap:9,borderTopWidth:1,borderTopColor:C.border},
  adminShopAction:{flexGrow:0,flexShrink:1,flexBasis:"31%",minWidth:0,minHeight:46,paddingHorizontal:10,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,borderRadius:10,backgroundColor:C.soft},
  adminShopActionsMobile:{flexWrap:"wrap",gap:9},
  adminShopActionMobile:{flexGrow:0,flexShrink:1,flexBasis:"47%",minWidth:0,minHeight:50,paddingHorizontal:8},
  adminShopActionPrimary:{backgroundColor:C.green},
  adminShopActionHalf:{flexBasis:"48%"},
  adminShopActionText:{color:C.dark,fontSize:12,fontWeight:"700"},
  adminLastLogin:{marginTop:3,color:C.muted,fontSize:12},
  staffPermissionGrid:{marginTop:8,gap:8},
  staffPermissionCard:{minHeight:64,padding:12,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.border,borderRadius:13,backgroundColor:C.white},
  staffPermissionCardOn:{backgroundColor:C.green,borderColor:C.green},
  staffPermissionTitle:{color:C.ink,fontSize:15,fontWeight:"700"},
  staffPermissionHelp:{marginTop:2,color:C.muted,fontSize:13,lineHeight:18},
  staffAccessSummary:{marginTop:11,marginBottom:10,color:C.muted,fontSize:13,lineHeight:19},
  manageShopHero:{marginTop:8,marginBottom:18,padding:18,flexDirection:"row",alignItems:"center",gap:13,borderWidth:1,borderColor:C.border,borderRadius:16,backgroundColor:C.white},
  manageShopGrid:{flexDirection:"row",flexWrap:"wrap",gap:12},
  manageShopCard:{width:"48%",minHeight:168,padding:17,justifyContent:"space-between",borderWidth:1,borderColor:C.border,borderRadius:17,backgroundColor:C.white},
  statusPillPaused:{backgroundColor:C.redSoft},
  statusTextPaused:{color:C.red},
  clearSaleText: { color: C.red, fontSize: 13, fontWeight: "700" },
  quickCard: {
    minHeight: 148,
    padding: 15,
    borderWidth:1,
    borderColor:C.border,
    borderRadius: 18,
    shadowColor: "#0D1722",
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  moreToolCard:{
    minHeight:148,
    padding:15,
    borderWidth:1,
    borderRadius:18,
    shadowColor:"#0D1722",
    shadowOpacity:.045,
    shadowRadius:10,
    shadowOffset:{width:0,height:4},
    elevation:1,
  },
  quickIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  quickTitle: { marginTop: 11, color: C.ink, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing:-.25 },
  quickHelp: { marginTop: 4, flex: 1, color: C.muted, fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
  quickGo: {
    minHeight: 38,
    marginTop: 9,
    paddingHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  quickGoText: { fontSize: 13, fontWeight: "700" },
  quickNote: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.redSoft,
    color: C.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  missedBanner: {
    marginBottom: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: C.orange,
  },
  eventBanner:{marginBottom:14,padding:13,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:"#DDE8E1",borderRadius:11,backgroundColor:C.accentSoft},
  eventBannerTitle:{color:C.accentDark,fontSize:15,fontWeight:"700"},
  eventBannerText:{marginTop:2,color:C.muted,fontSize:13},
  eventModeNote:{marginTop:8,padding:12,flexDirection:"row",alignItems:"flex-start",gap:9,borderWidth:1,borderColor:"#DCE7E2",borderRadius:12,backgroundColor:C.white},
  eventModeNoteText:{flex:1,color:C.muted,fontSize:13,lineHeight:19},
  eventModeNoteStrong:{color:C.ink,fontWeight:"700"},
  eventModeStep:{marginTop:5,color:C.ink,fontSize:13,lineHeight:19},
  eventModeTip:{marginTop:8,color:C.accentDark,fontSize:12,lineHeight:18,fontWeight:"700"},
  sellStartPage:{paddingTop:6,paddingBottom:40},
  flowGuide:{marginTop:18,marginBottom:4,padding:15,flexDirection:"row",alignItems:"flex-start",gap:12,borderWidth:1,borderRadius:15},
  flowGuideNumber:{width:32,height:32,alignItems:"center",justifyContent:"center",borderRadius:16},
  flowGuideNumberText:{color:C.white,fontSize:14,fontWeight:"800"},
  flowGuideTitle:{color:C.ink,fontSize:15,fontWeight:"700"},
  flowGuideText:{marginTop:3,color:C.muted,fontSize:13,lineHeight:19},
  formStep:{marginTop:24,paddingTop:18,flexDirection:"row",alignItems:"flex-start",gap:11,borderTopWidth:1,borderTopColor:C.border},
  formStepNumber:{width:31,height:31,alignItems:"center",justifyContent:"center",borderRadius:16},
  formStepNumberText:{color:C.white,fontSize:13,fontWeight:"800"},
  formStepTitle:{color:C.ink,fontSize:17,lineHeight:22,fontWeight:"700"},
  formStepHelp:{marginTop:3,color:C.muted,fontSize:13,lineHeight:19},
  saleWelcomeOverlay:{flex:1,padding:20,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(13,23,34,.62)"},
  saleWelcomeCard:{width:"100%",maxWidth:430,padding:26,borderRadius:24,backgroundColor:C.white,shadowColor:"#000",shadowOpacity:.18,shadowRadius:24,shadowOffset:{width:0,height:10},elevation:8},
  saleWelcomeIcon:{width:58,height:58,marginBottom:20,alignItems:"center",justifyContent:"center",borderRadius:18,backgroundColor:C.green},
  saleWelcomeTitle:{color:C.ink,fontSize:29,lineHeight:35,fontWeight:"700",letterSpacing:-.7},
  saleWelcomeDate:{marginTop:7,color:C.accent,fontSize:17,lineHeight:24,fontWeight:"700"},
  saleWelcomeHelp:{marginTop:8,marginBottom:20,color:C.muted,fontSize:15,lineHeight:22},
  saleWelcomePrimary:{minHeight:58,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,borderRadius:15,backgroundColor:C.green},
  saleWelcomePrimaryText:{color:C.white,fontSize:16,fontWeight:"700"},
  saleWelcomePrimaryHelp:{marginTop:2,color:"#DDE7F0",fontSize:13,fontWeight:"600"},
  saleWelcomeSecondary:{minHeight:56,marginTop:10,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,borderWidth:1,borderColor:C.accent,borderRadius:15,backgroundColor:C.white},
  saleWelcomeSecondaryText:{color:C.accent,fontSize:16,fontWeight:"700"},
  saleWelcomeSecondaryHelp:{marginTop:2,color:C.ink,fontSize:12,lineHeight:17},
  saleWelcomeLater:{minHeight:44,marginTop:7,alignItems:"center",justifyContent:"center"},
  saleWelcomeLaterText:{color:C.muted,fontSize:14,fontWeight:"600"},
  sellTodayCard:{marginBottom:18,padding:14,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  sellTodayLabel:{color:C.muted,fontSize:12,fontWeight:"700",letterSpacing:.6},
  sellTodayDate:{marginTop:3,color:C.ink,fontSize:15,fontWeight:"700"},
  saleDateBar:{marginBottom:14,paddingVertical:11,paddingHorizontal:13,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.white},
  saleDateBarLabel:{color:C.muted,fontSize:12,fontWeight:"700",letterSpacing:.45},
  saleDateBarValue:{marginTop:2,color:C.ink,fontSize:14,fontWeight:"700"},
  sellModeCard:{minHeight:108,marginTop:12,padding:17,flexDirection:"row",alignItems:"center",gap:14,borderWidth:1,borderColor:C.border,borderRadius:16},
  sellModeIcon:{width:56,height:56,alignItems:"center",justifyContent:"center",borderRadius:15},
  sellModeTitle:{color:C.ink,fontSize:21,fontWeight:"700"},
  sellModeHelp:{marginTop:4,color:C.muted,fontSize:14},
  earlierSale:{minHeight:72,marginTop:14,paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  missedSaleFeature:{minHeight:112,marginTop:14,marginBottom:24,padding:16,flexDirection:"row",alignItems:"center",gap:13,borderWidth:1.5,borderColor:SECTION.records.border,borderRadius:18,backgroundColor:SECTION.records.soft},
  missedSaleFeatureIcon:{width:52,height:52,alignItems:"center",justifyContent:"center",borderRadius:15,backgroundColor:SECTION.records.color},
  missedSaleFeatureTitle:{color:C.ink,fontSize:19,lineHeight:24,fontWeight:"700"},
  missedSaleFeatureHelp:{marginTop:3,color:C.muted,fontSize:14,lineHeight:20},
  missedSaleFeatureAction:{marginTop:8,color:SECTION.records.color,fontSize:12,fontWeight:"800",letterSpacing:.8},
  salesRecordHeading:{marginTop:28,color:SECTION.records.color,fontSize:18,lineHeight:24,fontWeight:"700"},
  salesRecordHelp:{marginTop:5,color:C.muted,fontSize:13,lineHeight:19},
  earlierSaleTitle:{color:C.ink,fontSize:15,fontWeight:"700"},
  earlierSaleHelp:{marginTop:2,color:C.muted,fontSize:12},
  missedBannerTitle: { color: C.white, fontSize: 18, fontWeight: "700" },
  missedBannerText: { marginTop: 3, color: C.white, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  step: {
    marginTop: 12,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.green,
  },
  stepNumber: { color: C.white, fontSize: 16, fontWeight: "700" },
  stepText: {
    flex: 1,
    color: C.dark,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  search: {
    minHeight: 56,
    marginTop: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  searchInput: { flex: 1, minHeight: 52, color: C.ink, fontSize: 17 },
  chips: { minHeight: 60, gap: 9, alignItems: "center", paddingVertical: 9 },
  stockFilterLabel: {
    marginTop: 13,
    marginBottom: 7,
    color: C.dark,
    fontSize: 14,
    fontWeight: "700",
  },
  stockFilterWrap: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stockPageHeading:{flexDirection:"row",alignItems:"center",gap:12},
  stockPageHeadingMobile:{flexDirection:"column",alignItems:"stretch"},
  stockPageHero:{marginTop:10,marginBottom:12,padding:16,borderWidth:1,borderColor:SECTION.stock.border,borderRadius:16,backgroundColor:SECTION.stock.soft},
  stockManageButton:{minHeight:46,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderRadius:12,backgroundColor:SECTION.stock.color},
  stockManageButtonText:{color:C.white,fontSize:14,fontWeight:"700"},
  stockEditButton:{width:42,height:42,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.white},
  stockFilters:{marginTop:12,padding:14,borderWidth:1,borderColor:C.border,borderRadius:16,backgroundColor:"#F8F9FA"},
  stockFiltersDesktop:{flexDirection:"row",alignItems:"flex-start",gap:14,paddingVertical:10},
  stockFilterGroup:{flex:1,minWidth:0},
  stockListContent:{paddingBottom:32},
  stockListHeader:{paddingBottom:4},
  stockGridRow:{gap:12},
  stockProductRow:{width:"100%"},
  stockProductRowDesktop:{width:"49%",minHeight:96,padding:14},
  stockCategoryPicker: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 17,
    backgroundColor: C.white,
  },
  stockCategoryPickerIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: C.accentSoft,
  },
  stockCategoryPickerText: { flex: 1, color: C.ink, fontSize: 16, fontWeight: "700" },
  stockCategoryChange: { color: C.accent, fontSize: 12, fontWeight: "700" },
  categoryMenu:{marginTop:7,overflow:"hidden",borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white,shadowColor:"#0D1722",shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:3},
  categoryMenuRow:{minHeight:50,paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:11,borderBottomWidth:1,borderBottomColor:"#EEF0F2"},
  categoryMenuRowOn:{backgroundColor:C.accentSoft},
  categoryMenuText:{flex:1,color:C.ink,fontSize:15,fontWeight:"700"},
  stockSortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stockResultCount: {
    marginTop: 12,
    color: C.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  categoryGrid: {
    marginTop: 16,
    paddingBottom: 26,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  categoryCard: {
    padding: 18,
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderRadius: 15,
    borderWidth: 1,
  },
  categoryCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCardText: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "700",
  },
  desktopCategoryTabs: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  chip: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  chipOn: { borderColor: C.green, backgroundColor: C.green },
  chipText: { color: C.ink, fontSize: 14, fontWeight: "700" },
  chipTextOn: { color: C.white },
  productList: { paddingBottom: 26 },
  productListBasket: { paddingBottom: 118 },
  productRow: { gap: 11 },
  productCard: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 188,
    marginBottom: 9,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
    shadowColor: "#0D1F2D",
    shadowOpacity: 0.04,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  disabled: { opacity: 0.78 },
  productOn: {
    borderWidth: 2.5,
    borderColor: C.green,
    backgroundColor: "#FCFDFF",
  },
  productVisual: {
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginBottom: 7,
    borderWidth:1,
    borderColor:"#EEF0F2",
    backgroundColor: C.white,
  },
  productCardImage: { width: "100%", height: "100%", resizeMode: "contain", objectFit:"contain" },
  missingPhoto: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#F0EDE7",
  },
  missingPhotoText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 0.7,
    textAlign: "center",
  },
  miniProductImage: { width: 46, height: 46, borderRadius: 14 },
  miniMissingPhoto: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#EEF2F7",
  },
  miniMissingText: {
    color: C.muted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 5,
    right: 5,
    minWidth: 32,
    height: 32,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.green,
  },
  badgeText: { color: C.white, fontSize: 16, fontWeight: "700" },
  saleBadge: {
    position: "absolute",
    top: 7,
    left: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: C.red,
  },
  saleBadgeText: { color: C.white, fontSize: 9, fontWeight: "700", letterSpacing: 0.7 },
  stockBadge: {
    position: "absolute",
    left: 7,
    bottom: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "rgba(13,31,45,0.88)",
  },
  stockBadgeLow: { backgroundColor: "rgba(121,34,56,0.92)" },
  stockBadgeText: { color: C.white, fontSize: 10, fontWeight: "700" },
  productName: {
    minHeight: 34,
    color: C.ink,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700",
  },
  productPrice: {
    marginTop: 1,
    color: C.dark,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  saleLine: { marginTop: 3, color: C.red, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  oldPrice: { color: C.muted, textDecorationLine: "line-through" },
  stock: { marginTop: 4, color: SECTION.stock.color, fontSize: 14, lineHeight: 19, fontWeight: "700" },
  low: { color: C.orange, fontWeight: "700" },
  basket: {
    position: "absolute",
    left: -16,
    right: -16,
    bottom: 0,
    minHeight: 100,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  basketCount: { color: C.muted, fontSize: 13, fontWeight: "700" },
  basketTotal: { marginTop: 2, color: C.ink, fontSize: 25, fontWeight: "700" },
  reviewButton: {
    minHeight: 60,
    paddingHorizontal: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 7,
    backgroundColor: C.green,
  },
  reviewText: { color: C.white, fontSize: 16, fontWeight: "700" },
  back: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10 },
  backButton: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  backTitle: { color: C.ink, fontSize: 22, fontWeight: "700" },
  cartRow: {
    minHeight: 88,
    marginTop: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    backgroundColor: C.white,
  },
  cartProductTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  pastPriceField:{marginTop:8,alignItems:"flex-start"},
  pastPriceLabel:{color:C.ink,fontSize:13,fontWeight:"700"},
  currentPriceButton:{marginTop:6,minHeight:42,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:7,borderWidth:1,borderColor:SECTION.records.border,borderRadius:10,backgroundColor:SECTION.records.soft},
  currentPriceButtonOn:{borderColor:SECTION.records.color,backgroundColor:SECTION.records.color},
  currentPriceButtonText:{color:SECTION.records.color,fontSize:13,fontWeight:"700"},
  currentPriceButtonTextOn:{color:C.white},
  pastPriceOr:{marginTop:9,color:C.muted,fontSize:10,fontWeight:"700",letterSpacing:.65},
  pastPriceInputWrap:{marginTop:5,width:150,height:46,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:5,borderWidth:1.5,borderColor:SECTION.records.color,borderRadius:10,backgroundColor:C.white},
  pastPricePeso:{color:C.ink,fontSize:18,fontWeight:"700"},
  pastPriceInput:{flex:1,paddingVertical:0,color:C.ink,fontSize:19,fontWeight:"700",outlineStyle:"none"} as any,
  pastPriceHint:{marginTop:4,color:C.muted,fontSize:12,lineHeight:17},
  cartProductBottom: {
    marginTop: 10,
    paddingTop: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: C.border,
  },
  quantityLabel: { color: C.muted, fontSize: 13, fontWeight: "700" },
  rowTitle: { color: C.ink, fontSize: 16, fontWeight: "700" },
  rowHelp: { marginTop: 3, color: C.muted, fontSize: 13, lineHeight: 18 },
  lineTotal: {
    minWidth: 65,
    color: C.ink,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  quantity: { flexDirection: "row", alignItems: "center", gap: 5 },
  qtyButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: C.soft,
  },
  qtyNumber: {
    minWidth: 30,
    color: C.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  totalBox: {
    marginTop: 14,
    padding: 19,
    borderRadius: 10,
    backgroundColor: C.dark,
  },
  totalLabel: { color: "#DDE4FF", fontSize: 15, fontWeight: "700" },
  totalValue: { marginTop: 5, color: C.white, fontSize: 34, fontWeight: "700" },
  section: {
    marginTop: 24,
    marginBottom: 9,
    color: C.ink,
    fontSize: 19,
    fontWeight: "700",
  },
  choiceRow: { flexDirection: "row", gap: 10 },
  stockActionChoices: { gap: 9 },
  choice: {
    flex: 1,
    minHeight: 84,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  choiceOn: { borderWidth: 2.5, borderColor: C.green, backgroundColor: C.soft },
  choiceDanger: { borderColor: C.red, backgroundColor: C.redSoft },
  choiceText: { color: C.muted, fontSize: 15, fontWeight: "700" },
  bigButton: {
    minHeight: 62,
    marginTop: 18,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 12,
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bigButtonText: { color: C.white, fontSize: 17, fontWeight: "700" },
  safe: { marginTop: 11, color: C.muted, fontSize: 13, textAlign: "center" },
  hero: {
    marginTop: 16,
    padding: 21,
    borderRadius: 16,
    backgroundColor: C.dark,
  },
  heroLabel: { color: "#DDE4FF", fontSize: 15, fontWeight: "700" },
  heroValue: { marginTop: 5, color: C.white, fontSize: 36, fontWeight: "700" },
  heroSmall: { marginTop: 5, color: "#DDE4FF", fontSize: 13 },
  stats: { marginTop: 10, flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  statLabel: { marginTop: 8, color: C.muted, fontSize: 13, fontWeight: "700" },
  statValue: { marginTop: 3, color: C.ink, fontSize: 20, fontWeight: "700" },
  soldRow: {
    minHeight: 66,
    marginBottom: 7,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  soldIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.accentSoft,
  },
  soldName: { flex: 1, color: C.ink, fontSize: 15, fontWeight: "700" },
  soldQty: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.green,
  },
  soldQtyText: { color: C.white, fontSize: 18, fontWeight: "700" },
  receipt: {
    marginBottom: 9,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  receiptTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  receiptRight: { alignItems: "flex-end" },
  paymentText: {
    marginTop: 3,
    color: C.accentDark,
    fontSize: 11,
    fontWeight: "700",
  },
  receiptItems: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderColor: "#EDF1F8",
    gap: 5,
  },
  receiptProduct: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  attention: {
    minHeight: 72,
    marginBottom: 8,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 19,
    backgroundColor: C.orangeSoft,
  },
  alertIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#FFE1B5",
  },
  editCard: {
    marginTop: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    backgroundColor: C.white,
  },
  requiredNote:{marginBottom:14,padding:13,flexDirection:"row",alignItems:"flex-start",gap:9,borderWidth:1,borderColor:SECTION.stock.border,borderRadius:12,backgroundColor:SECTION.stock.soft},
  requiredNoteText:{flex:1,color:C.muted,fontSize:13,lineHeight:19},
  requiredNoteStrong:{color:C.ink,fontWeight:"700"},
  editHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  editName: { color: C.ink, fontSize: 22, fontWeight: "700" },
  productMiniIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.accentSoft,
  },
  productPhoto: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1,
    alignSelf: "center",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#EEF2F7",
  },
  productPhotoImage: { width: "100%", height: "100%", resizeMode: "contain" },
  priceInput: {
    minHeight: 60,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 13,
    color: C.ink,
    fontSize: 24,
    fontWeight: "700",
  },
  note: {
    marginTop: 16,
    padding: 12,
    flexDirection: "row",
    gap: 9,
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  noteText: { flex: 1, color: C.dark, fontSize: 14, lineHeight: 20 },
  inlineLink:{alignSelf:"flex-start",minHeight:38,marginTop:7,flexDirection:"row",alignItems:"center",gap:6},
  inlineLinkText:{fontSize:13,fontWeight:"700"},
  list: { paddingVertical: 10, paddingBottom: 28 },
  listRow: {
    minHeight: 78,
    marginBottom: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  listIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: C.accentSoft,
  },
  stockListImage:{width:52,height:52,borderWidth:1,borderColor:C.border,borderRadius:12,resizeMode:"contain",backgroundColor:C.white},
  stockListImageDesktop:{width:68,height:68,borderRadius:14},
  listImage: { width: 58, height: 58, borderRadius: 16, resizeMode: "cover" },
  manageCategoryButton: { minHeight: 48, marginTop: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: C.soft },
  manageCategoryText: { color: C.dark, fontSize: 14, fontWeight: "700" },
  categoryManageRow: { minHeight: 72, marginTop: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: C.border, borderRadius: 18, backgroundColor: C.white },
  categoryManageIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.soft },
  smallAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.soft },
  smallActionDanger: { backgroundColor: C.redSoft },
  cancelCategory: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelCategoryText: { color: C.muted, fontSize: 14, fontWeight: "700" },
  duplicateProductButton:{minHeight:58,marginTop:12,paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},
  duplicateProductText:{color:C.accent,fontSize:16,fontWeight:"700"},
  deleteProductButton:{minHeight:52,marginTop:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,borderWidth:1,borderColor:"#E7CBD2",borderRadius:10,backgroundColor:"#FFF7F8"},
  deleteProductText:{color:C.red,fontSize:15,fontWeight:"700"},
  listMissingPhoto: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#EEF2F7",
  },
  listMissingText: {
    color: C.muted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  rowPrice: { color: C.dark, fontSize: 16, fontWeight: "700" },
  stockBig: {
    marginTop: 22,
    color: C.dark,
    fontSize: 48,
    fontWeight: "700",
    textAlign: "center",
  },
  stockLabel: { color: C.muted, fontSize: 14, textAlign: "center" },
  qtyInput: {
    minHeight: 76,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    color: C.ink,
    backgroundColor: C.cream,
    fontSize: 36,
    fontWeight: "700",
    textAlign: "center",
  },
  stockNum: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal:7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.soft,
  },
  stockNumLow: { backgroundColor: C.orangeSoft },
  stockNumText: { color: C.dark, fontSize: 19, fontWeight: "700" },
  stockNumLabel:{marginTop:-2,color:C.muted,fontSize:12,fontWeight:"600",textTransform:"uppercase",letterSpacing:.3},
  priceListHero:{marginTop:14,padding:20,flexDirection:"row",alignItems:"center",gap:16,borderWidth:1,borderColor:C.border,borderRadius:13,backgroundColor:"#F5F7F8"},
  priceListKicker:{color:C.accent,fontSize:12,fontWeight:"700",letterSpacing:1.1},
  priceListTitle:{marginTop:5,color:C.ink,fontSize:26,fontWeight:"700",letterSpacing:-.5},
  priceListHelp:{marginTop:4,color:C.muted,fontSize:14,lineHeight:20},
  priceWarning:{marginTop:10,padding:12,flexDirection:"row",alignItems:"center",gap:8,borderRadius:10,backgroundColor:C.orangeSoft},
  priceWarningText:{flex:1,color:C.ink,fontSize:13,fontWeight:"600"},
  priceActions:{marginTop:12,flexDirection:"row",gap:9},
  priceActionsMobile:{flexDirection:"column"},
  pricePrimary:{minHeight:50,flex:1,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderRadius:10,backgroundColor:SECTION.stock.color},
  pricePrimaryText:{color:C.white,fontSize:14,fontWeight:"700"},
  priceSecondary:{minHeight:50,flex:1,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,borderWidth:1,borderColor:C.border,borderRadius:10,backgroundColor:C.white},
  priceSecondaryText:{color:C.dark,fontSize:14,fontWeight:"700"},
  priceSection:{marginTop:18,overflow:"hidden",borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:C.white},
  priceSectionMark:{height:4,width:"100%"},
  priceSectionTitle:{paddingHorizontal:14,paddingTop:13,paddingBottom:9,color:C.ink,fontSize:18,fontWeight:"700"},
  priceRow:{minHeight:52,paddingHorizontal:14,paddingVertical:9,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,borderTopWidth:1,borderTopColor:"#ECEEEF"},
  priceName:{flex:1,color:C.ink,fontSize:14,lineHeight:19,fontWeight:"600"},
  priceRight:{alignItems:"flex-end"},
  priceValue:{color:C.dark,fontSize:17,fontWeight:"700"},
  priceSaleTag:{marginBottom:1,color:C.red,fontSize:12,fontWeight:"700",letterSpacing:.5},
  priceMissing:{color:C.orange,fontSize:12},
  menu: {
    minHeight: 84,
    marginTop: 10,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  menuIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: C.soft,
  },
  menuTitle: { color: C.ink, fontSize: 17, fontWeight: "700" },
  locationCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    backgroundColor: C.white,
  },
  locationRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: "#EDF1F8",
  },
  addLocation: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addText: { color: C.green, fontSize: 15, fontWeight: "700" },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  account: {
    minHeight: 80,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  avatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: C.green,
  },
  avatarText: { color: C.white, fontSize: 21, fontWeight: "700" },
  signout: {
    minHeight: 58,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0C8D0",
    borderRadius: 20,
    backgroundColor: C.redSoft,
  },
  signoutText: { color: C.red, fontSize: 16, fontWeight: "700" },
  empty: {
    marginTop: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 21,
    backgroundColor: C.white,
  },
  whatsNewOverlay:{flex:1,padding:18,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(13,23,34,.58)"},
  whatsNewCard:{width:"100%",maxWidth:470,maxHeight:"92%",padding:22,borderRadius:19,backgroundColor:C.white,shadowColor:"#0D1722",shadowOpacity:.24,shadowRadius:24,shadowOffset:{width:0,height:12},elevation:10},
  whatsNewIcon:{width:54,height:54,alignItems:"center",justifyContent:"center",borderRadius:16,backgroundColor:C.green},
  whatsNewKicker:{marginTop:18,color:C.green,fontSize:11,fontWeight:"800",letterSpacing:1.4},
  whatsNewTitle:{marginTop:5,color:C.ink,fontSize:25,lineHeight:31,fontWeight:"700",letterSpacing:-.4},
  whatsNewDate:{marginTop:5,color:C.muted,fontSize:13,fontWeight:"600"},
  whatsNewList:{marginTop:18,gap:9},
  whatsNewRow:{padding:12,flexDirection:"row",alignItems:"flex-start",gap:10,borderWidth:1,borderColor:C.border,borderRadius:13,backgroundColor:C.soft},
  whatsNewRowIcon:{width:37,height:37,alignItems:"center",justifyContent:"center",borderRadius:11,backgroundColor:C.white},
  whatsNewRowTitle:{color:C.ink,fontSize:14,fontWeight:"700"},
  whatsNewRowText:{marginTop:3,color:C.muted,fontSize:13,lineHeight:18},
  guideOverlay: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32,50,77,.56)",
  },
  guideCard: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "92%",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: C.white,
    shadowColor: "#15233A",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  guideHeader: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  guideKicker: {
    color: C.accentDark,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  guideCount: {
    marginLeft: "auto",
    marginRight: 10,
    color: C.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  guideClose: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.cream,
  },
  guideContent: { padding: 22, alignItems: "center" },
  guideHero: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: C.green,
  },
  guideTitle: {
    marginTop: 18,
    color: C.ink,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "700",
    textAlign: "center",
  },
  guideBody: {
    marginTop: 9,
    color: C.muted,
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
  },
  guideFlow: {
    width: "100%",
    marginTop: 22,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
  },
  guideFlowPart: { flexShrink: 1, flexDirection: "row", alignItems: "center" },
  guideFlowItem: {
    minWidth: 66,
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  guideFlowLabel: {
    color: C.dark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  guideDots: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  guideDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  guideDotOn: { width: 22, backgroundColor: C.green },
  guideActions: { padding: 16, paddingTop: 4, flexDirection: "row", gap: 10 },
  guideBack: {
    minHeight: 58,
    minWidth: 92,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 19,
    backgroundColor: C.white,
  },
  guideBackText: { color: C.dark, fontSize: 16, fontWeight: "700" },
  guideNext: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 19,
    backgroundColor: C.green,
  },
  guideNextText: { color: C.white, fontSize: 16, fontWeight: "700" },
  gcashCheck: {
    marginTop: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  cashCalculator: {
    marginTop: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.accentSoft,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  pastDatePage:{width:"100%",maxWidth:620,alignSelf:"center",paddingBottom:40},
  pastQuickDates:{marginTop:16,flexDirection:"row",gap:8},
  pastQuickDate:{flex:1,minHeight:44,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border,borderRadius:11,backgroundColor:C.white},
  pastQuickDateText:{color:C.dark,fontSize:12,fontWeight:"700"},
  pastCalendar:{marginTop:12,padding:14,borderWidth:1,borderColor:C.border,borderRadius:18,backgroundColor:C.white},
  pastCalendarTop:{minHeight:46,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  pastMonthButton:{width:42,height:42,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:C.soft},
  pastMonthTitle:{color:C.ink,fontSize:18,fontWeight:"700"},
  pastWeekRow:{marginTop:7,flexDirection:"row"},
  pastWeekDay:{width:"14.2857%",paddingVertical:7,color:C.muted,fontSize:12,fontWeight:"700",textAlign:"center"},
  pastDays:{flexDirection:"row",flexWrap:"wrap"},
  pastDay:{width:"14.2857%",aspectRatio:1,alignItems:"center",justifyContent:"center",borderRadius:12},
  pastDayOn:{backgroundColor:SECTION.records.color},
  pastDayText:{color:C.ink,fontSize:14,fontWeight:"600"},
  pastDayOutside:{color:"#B6BDC3"},
  pastDayDisabled:{color:"#D8DCDF"},
  pastDayTextOn:{color:C.white,fontWeight:"700"},
  pastDateSelected:{minHeight:72,marginTop:12,padding:13,flexDirection:"row",alignItems:"center",gap:11,borderWidth:1,borderColor:SECTION.records.border,borderRadius:14,backgroundColor:SECTION.records.soft},
  pastDateSelectedLabel:{color:SECTION.records.color,fontSize:12,fontWeight:"700",letterSpacing:.7},
  pastDateSelectedValue:{marginTop:3,color:C.ink,fontSize:17,fontWeight:"700"},
  pastSaleSummary:{marginTop:14,padding:13,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:C.border,borderRadius:14,backgroundColor:C.white},
  changePastDateButton:{minHeight:40,paddingHorizontal:10,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:C.soft},
  changePastDateText:{color:SECTION.records.color,fontSize:12,fontWeight:"700"},
  pastSaleIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.soft },
  cashIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.accentSoft,
  },
  cashInput: {
    minHeight: 68,
    marginTop: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: C.accent,
    borderRadius: 12,
    backgroundColor: C.cream,
    color: C.ink,
    fontSize: 28,
    fontWeight: "700",
  },
  quickCashRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  quickCash: {
    minHeight: 46,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.accentSoft,
  },
  quickCashText: { color: C.accentDark, fontSize: 15, fontWeight: "700" },
  changeBox: {
    marginTop: 14,
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: C.accentDark,
  },
  changeBoxShort: { backgroundColor: C.red },
  changeValue: { marginTop: 4, color: C.white, fontSize: 34, fontWeight: "700" },
  gcashHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  gcashIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.soft,
  },
  receivedButton: {
    minHeight: 60,
    marginTop: 14,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderWidth: 2,
    borderColor: C.green,
    borderRadius: 13,
    backgroundColor: C.soft,
  },
  receivedButtonOn: { backgroundColor: C.accent, borderColor: C.accent },
  receivedText: {
    flexShrink: 1,
    color: C.dark,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  receivedTextOn: { color: C.white },
  referenceText: {
    marginTop: 2,
    color: C.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  variantChosen: {
    marginTop: 3,
    color: C.teal,
    fontSize: 14,
    fontWeight: "700",
  },
  variantHint: { marginTop: 4, color: C.teal, fontSize: 12, fontWeight: "700" },
  variantOverlay: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32,50,77,.56)",
  },
  variantCard: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "86%",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: C.white,
  },
  variantHeader: {
    minHeight: 78,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  variantKicker: {
    color: C.teal,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  variantTitle: { marginTop: 3, color: C.ink, fontSize: 21, fontWeight: "700" },
  variantGrid: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  variantButton: {
    width: "22%",
    minWidth: 72,
    minHeight: 70,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.white,
  },
  variantButtonOn: {
    borderWidth: 3,
    borderColor: C.green,
    backgroundColor: C.green,
  },
  variantButtonText: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  variantButtonTextOn: { color: C.white },
  variantStock: {
    marginTop: 3,
    color: C.teal,
    fontSize: 11,
    fontWeight: "700",
  },
  variantStockOn: { color: C.white },
  variantRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: C.white,
  },
  designButton: {
    width: "100%",
    minHeight: 92,
    padding: 16,
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.white,
  },
  designButtonText: { color: C.ink, fontSize: 20, fontWeight: "700" },
  designPrice: { marginTop: 5, color: C.green, fontSize: 24, fontWeight: "700" },
  designStock: { marginTop: 3, color: C.muted, fontSize: 14, fontWeight: "700" },
  letterFooter: {
    width: "100%",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.white,
  },
  letterCount: {
    color: C.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  letterAddButton: {
    width: "100%",
    minHeight: 64,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 14,
    backgroundColor: C.green,
  },
  letterAddText: { color: C.white, fontSize: 18, fontWeight: "700" },
  productKindChoices: { marginTop: 8, gap: 8 },
  productKindChoice: {
    minHeight: 72,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
  },
  productKindChoiceOn: {
    borderColor: SECTION.stock.color,
    backgroundColor: SECTION.stock.color,
  },
  productKindTitle: { color: C.ink, fontSize: 16, fontWeight: "700" },
  productKindTextOn: { color: C.white },
  productKindHelp: { marginTop: 3, color: C.muted, fontSize: 13, lineHeight: 18 },
  productKindHelpOn: { color: "#E3ECE7" },
  clickerSetup: {
    marginTop: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: SECTION.stock.border,
    borderRadius: 14,
    backgroundColor: SECTION.stock.soft,
  },
  clickerSetupTitle: { color: C.ink, fontSize: 18, fontWeight: "700", marginBottom: 4 },
  clickerOption: {
    minHeight: 44,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SECTION.stock.border,
    borderRadius: 10,
    backgroundColor: C.white,
  },
  clickerSlot: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SECTION.stock.border,
    borderRadius: 10,
    backgroundColor: C.white,
  },
  clickerOptionOn: { borderColor: SECTION.stock.color, backgroundColor: SECTION.stock.color },
  clickerOptionText: { color: C.ink, fontSize: 14, fontWeight: "700" },
  clickerOptionTextOn: { color: C.white },
  clickerLogicNote: { marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  clickerLogicText: { flex: 1, color: C.ink, fontSize: 13, lineHeight: 19 },
  choiceSetup: {
    marginTop: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 22,
    backgroundColor: C.cream,
  },
  choiceSetupTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  choiceToggle: {
    minWidth: 64,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.border,
  },
  choiceToggleOn: { backgroundColor: C.teal },
  choiceToggleText: { color: C.muted, fontSize: 14, fontWeight: "700" },
  choiceToggleTextOn: { color: C.white },
  alphabetButton: {
    minHeight: 54,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.green,
    borderRadius: 18,
    backgroundColor: C.soft,
  },
  alphabetText: { color: C.dark, fontSize: 16, fontWeight: "700" },
  choiceInput: { minHeight: 92, textAlignVertical: "top", paddingTop: 15 },
  choicePills: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  choicePill: {
    minWidth: 42,
    minHeight: 38,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: C.tealSoft,
  },
  choicePillText: { color: C.teal, fontSize: 14, fontWeight: "700" },
  variantLetter: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.tealSoft,
  },
  variantLetterText: { color: C.teal, fontSize: 18, fontWeight: "700" },
});
