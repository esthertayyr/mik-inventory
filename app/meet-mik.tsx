import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const C = {
  ink: "#101318",
  muted: "#626A73",
  navy: "#142C47",
  green: "#264A3B",
  ruby: "#65243A",
  paleBlue: "#F2F5F7",
  paleGreen: "#F3F6F4",
  paleRuby: "#F8F4F5",
  soft: "#F6F7F8",
  border: "#E0E3E7",
  white: "#FFFFFF",
};

type IconName = keyof typeof Ionicons.glyphMap;

const benefits: { icon: IconName; title: string; body: string; tone: string }[] = [
  { icon: "flash-outline", title: "Sell in a few taps", body: "Choose a product, quantity and payment. MIK handles the rest.", tone: C.navy },
  { icon: "cube-outline", title: "Know what is left", body: "Stock updates after every completed sale, so restocking is easier.", tone: C.green },
  { icon: "trending-up-outline", title: "See what sells", body: "Check today, week or month and learn which products customers choose.", tone: C.ruby },
];

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "storefront-outline", title: "Shop and event sales", body: "Use normal checkout in the shop or faster selling at markets and pop-ups." },
  { icon: "images-outline", title: "Visual product selection", body: "Cashiers match products using clear photographs instead of codes." },
  { icon: "calendar-outline", title: "Earlier sales", body: "Choose the original date first, then record the products and payment type." },
  { icon: "receipt-outline", title: "Customer orders", body: "Track downpayments, order progress, balance and where the order came from." },
  { icon: "hardware-chip-outline", title: "Production overview", body: "See printer condition and keep a simple record of filament supplies." },
  { icon: "download-outline", title: "Excel-ready reports", body: "Export daily, weekly or monthly sales in a familiar format." },
];

function WebAppButton({ light = false }: { light?: boolean }) {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" style={[s.primaryButton, light && s.primaryButtonLight]} onPress={() => router.push("/")}>
      <Text style={[s.primaryButtonText, light && s.primaryButtonTextDark]}>Open MIK</Text>
      <Ionicons name="arrow-forward" size={20} color={light ? C.navy : C.white} />
    </Pressable>
  );
}

function PhonePreview() {
  return (
    <View style={s.phoneShadow}>
      <View style={s.phone}>
        <View style={s.phoneTop}><Text style={s.phoneTime}>9:41</Text><View style={s.phoneSignals}><Ionicons name="cellular" size={13} color={C.ink}/><Ionicons name="wifi" size={13} color={C.ink}/><Ionicons name="battery-full" size={15} color={C.ink}/></View></View>
        <View style={s.phoneBrand}><Image source={require("../assets/mik-app-icon.png")} style={s.phoneLogo as any}/><View><Text style={s.phoneShop}>Your Shop</Text><Text style={s.phoneLocation}>Main location</Text></View></View>
        <Text style={s.phoneGreeting}>good afternoon.</Text>
        <Text style={s.phoneDate}>Monday · 31 August</Text>
        <View style={s.phoneCards}>
          <View style={[s.phoneAction,{backgroundColor:C.paleBlue}]}><View style={[s.phoneActionIcon,{backgroundColor:C.navy}]}><Ionicons name="cart" size={22} color={C.white}/></View><Text style={s.phoneActionTitle}>New sale</Text><Text style={s.phoneActionHelp}>Start selling</Text></View>
          <View style={[s.phoneAction,{backgroundColor:C.paleGreen}]}><View style={[s.phoneActionIcon,{backgroundColor:C.green}]}><Ionicons name="today" size={22} color={C.white}/></View><Text style={s.phoneActionTitle}>Today</Text><Text style={s.phoneActionHelp}>See sales</Text></View>
          <View style={[s.phoneAction,{backgroundColor:C.paleRuby}]}><View style={[s.phoneActionIcon,{backgroundColor:C.ruby}]}><Ionicons name="cube" size={22} color={C.white}/></View><Text style={s.phoneActionTitle}>Stock</Text><Text style={s.phoneActionHelp}>Check items</Text></View>
          <View style={[s.phoneAction,{backgroundColor:C.soft}]}><View style={[s.phoneActionIcon,{backgroundColor:"#49515A"}]}><Ionicons name="receipt" size={22} color={C.white}/></View><Text style={s.phoneActionTitle}>Orders</Text><Text style={s.phoneActionHelp}>Track work</Text></View>
        </View>
        <View style={s.phoneNav}><Ionicons name="home" size={20} color={C.navy}/><Ionicons name="cart-outline" size={20} color="#9AA0A6"/><Ionicons name="today-outline" size={20} color="#9AA0A6"/><Ionicons name="cube-outline" size={20} color="#9AA0A6"/></View>
      </View>
    </View>
  );
}

function ProductPreview() {
  return (
    <View style={s.previewPanel}>
      <View style={s.previewTop}><View><Text style={s.previewKicker}>SELL</Text><Text style={s.previewTitle}>Choose a product</Text></View><View style={s.todayPill}><View style={s.todayDot}/><Text style={s.todayPillText}>Recording for today</Text></View></View>
      <View style={s.previewCategories}><View style={[s.previewCategory,{backgroundColor:C.paleBlue}]}><Ionicons name="keypad" size={25} color={C.navy}/><Text style={s.previewCategoryText}>Clickers</Text></View><View style={[s.previewCategory,{backgroundColor:C.paleGreen}]}><Ionicons name="sync" size={25} color={C.green}/><Text style={s.previewCategoryText}>Fidgets</Text></View><View style={[s.previewCategory,{backgroundColor:C.paleRuby}]}><Ionicons name="sparkles" size={25} color={C.ruby}/><Text style={s.previewCategoryText}>Display</Text></View></View>
      <View style={s.previewProducts}>
        <View style={s.previewProduct}><Image source={require("../assets/product-placeholders/keyboard-clicker.png")} style={s.previewImage as any}/><View style={s.previewProductBody}><Text style={s.previewProductName} numberOfLines={1}>Keyboard Clicker</Text><View style={s.previewProductBottom}><Text style={s.previewPrice}>₱150</Text><Text style={s.previewStock}>12 left</Text></View></View></View>
        <View style={s.previewProduct}><Image source={require("../assets/product-placeholders/starfish-fidget.png")} style={s.previewImage as any}/><View style={s.previewProductBody}><Text style={s.previewProductName} numberOfLines={1}>Starfish Fidget</Text><View style={s.previewProductBottom}><Text style={s.previewPrice}>₱200</Text><Text style={s.previewStock}>8 left</Text></View></View></View>
      </View>
    </View>
  );
}

export default function MeetMik() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const narrow = width < 480;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const previousTitle = document.title;
    document.title = "Meet MIK · Simple Shopkeeping";
    return () => { document.title = previousTitle; };
  }, []);
  return (
    <SafeAreaView style={s.page}>
      <Stack.Screen options={{ title: "Meet MIK · Simple Shopkeeping" }} />
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.nav}>
          <View style={s.navInner}>
            <View style={s.brand}><Image source={require("../assets/mik-app-icon.png")} style={s.brandLogo as any}/><Text style={s.brandWord}>MIK</Text></View>
            <View style={s.navRight}>
              {!narrow ? <Text style={s.navNote}>Simple shopkeeping</Text> : null}
              <Pressable accessibilityRole="link" style={s.navLogin} onPress={() => router.push("/")}><Text style={s.navLoginText}>Sign in</Text></Pressable>
            </View>
          </View>
        </View>

        <View style={[s.hero,compact&&s.heroCompact]}>
          <View style={[s.heroCopy,compact&&s.heroCopyCompact]}>
            <View style={s.eyebrow}><View style={s.eyebrowDot}/><Text style={s.eyebrowText}>SHOPKEEPING MADE CALM</Text></View>
            <Text style={[s.heroTitle,compact&&s.heroTitleCompact]}>Running a shop should feel simple.</Text>
            <Text style={s.heroBody}>MIK keeps sales, stock and customer orders clear. Busy sellers always know what happened today and what to prepare next.</Text>
            <View style={[s.heroActions,narrow&&s.heroActionsNarrow]}><WebAppButton/><View style={s.comingSoon}><Ionicons name="phone-portrait-outline" size={18} color={C.muted}/><Text style={s.comingSoonText}>iOS & Android coming later</Text></View></View>
            <View style={s.heroChecks}><View style={s.heroCheck}><Ionicons name="checkmark-circle" size={18} color={C.green}/><Text style={s.heroCheckText}>Plain English</Text></View><View style={s.heroCheck}><Ionicons name="checkmark-circle" size={18} color={C.green}/><Text style={s.heroCheckText}>Mobile first</Text></View><View style={s.heroCheck}><Ionicons name="checkmark-circle" size={18} color={C.green}/><Text style={s.heroCheckText}>Excel ready</Text></View></View>
          </View>
          <View style={[s.heroVisual,compact&&s.heroVisualCompact]}><View style={s.heroCircleOne}/><View style={s.heroCircleTwo}/><PhonePreview/></View>
        </View>

        <View style={s.trustStrip}><View style={s.trustInner}><Text style={s.trustLead}>Made for real selling days.</Text><View style={s.trustItems}><Text style={s.trustItem}>SHOP COUNTERS</Text><Text style={s.trustDivider}>•</Text><Text style={s.trustItem}>POP-UP EVENTS</Text><Text style={s.trustDivider}>•</Text><Text style={s.trustItem}>SMALL TEAMS</Text></View></View></View>

        <View style={s.section}>
          <Text style={s.sectionKicker}>LESS GUESSING. MORE CLARITY.</Text>
          <Text style={[s.sectionTitle,compact&&s.sectionTitleCompact]}>Everything important, understood at a glance.</Text>
          <Text style={s.sectionIntro}>MIK turns everyday shop work into short, visual steps that new staff can learn quickly.</Text>
          <View style={[s.benefitGrid,compact&&s.stack]}>{benefits.map((item)=><View key={item.title} style={[s.benefitCard,compact&&s.full]}><View style={[s.benefitIcon,{backgroundColor:item.tone}]}><Ionicons name={item.icon} size={26} color={C.white}/></View><Text style={s.benefitTitle}>{item.title}</Text><Text style={s.benefitBody}>{item.body}</Text></View>)}</View>
        </View>

        <View style={s.storySection}>
          <View style={[s.storyInner,compact&&s.stack]}>
            <View style={[s.storyCopy,compact&&s.full]}><Text style={s.sectionKicker}>A FASTER WAY TO SELL</Text><Text style={[s.storyTitle,compact&&s.sectionTitleCompact]}>Photos first. Fewer mistakes.</Text><Text style={s.storyBody}>Choose a category, recognise the product, select the quantity and collect payment. Sale prices appear automatically, and completed sales update stock.</Text><View style={s.storyPoint}><Ionicons name="images-outline" size={22} color={C.navy}/><View style={s.flex}><Text style={s.storyPointTitle}>Visual product cards</Text><Text style={s.storyPointBody}>Cashiers can match the item in their hand with its photograph.</Text></View></View><View style={s.storyPoint}><Ionicons name="cash-outline" size={22} color={C.green}/><View style={s.flex}><Text style={s.storyPointTitle}>Cash and GCash</Text><Text style={s.storyPointBody}>Calculate change or confirm that mobile payment was received.</Text></View></View></View>
            <View style={[s.storyVisual,compact&&s.full]}><ProductPreview/></View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionKicker}>ONE SIMPLE WORKSPACE</Text>
          <Text style={[s.sectionTitle,compact&&s.sectionTitleCompact]}>Useful tools without the clutter.</Text>
          <View style={[s.featureGrid,compact&&s.featureGridCompact]}>{features.map((item)=><View key={item.title} style={[s.featureCard,compact&&s.featureCardCompact]}><View style={s.featureIcon}><Ionicons name={item.icon} size={24} color={C.navy}/></View><View style={s.flex}><Text style={s.featureTitle}>{item.title}</Text><Text style={s.featureBody}>{item.body}</Text></View></View>)}</View>
        </View>

        <View style={s.eventSection}>
          <View style={[s.eventInner,compact&&s.stack]}>
            <View style={[s.eventBadge,compact&&s.eventBadgeCompact]}><Ionicons name="flash" size={31} color={C.white}/><Text style={s.eventBadgeSmall}>EVENT SALE</Text><Text style={s.eventBadgeBig}>Fast when the crowd arrives.</Text></View>
            <View style={[s.eventCopy,compact&&s.full]}><Text style={s.eventTitle}>Pop-up selling, without slowing the line.</Text><Text style={s.eventBody}>Event Sale removes unnecessary steps for fast checkout. MIK records what sold, then reminds the team to count shared letter stock after the event.</Text><View style={s.eventSteps}><View style={s.eventStep}><Text style={s.eventStepNumber}>1</Text><Text style={s.eventStepText}>Tap the product</Text></View><View style={s.eventStep}><Text style={s.eventStepNumber}>2</Text><Text style={s.eventStepText}>Take payment</Text></View><View style={s.eventStep}><Text style={s.eventStepNumber}>3</Text><Text style={s.eventStepText}>Start the next sale</Text></View></View></View>
          </View>
        </View>

        <View style={s.closing}>
          <Image source={require("../assets/mik-app-icon.png")} style={s.closingLogo as any}/>
          <Text style={[s.closingTitle,compact&&s.sectionTitleCompact]}>Make every sale count.</Text>
          <Text style={s.closingBody}>A calmer way to sell, count and understand your shop.</Text>
          <WebAppButton light/>
          <Text style={s.closingNote}>MIK is currently available as a web application.</Text>
        </View>

        <View style={s.footer}><View style={[s.footerInner,compact&&s.stack]}><View><View style={s.brand}><Image source={require("../assets/mik-app-icon.png")} style={s.footerLogo as any}/><Text style={s.footerBrand}>MIK</Text></View><Text style={s.footerTag}>Simple shopkeeping for busy people.</Text></View><View style={s.footerLinks}><Pressable accessibilityRole="link" onPress={() => router.push("/")}><Text style={s.footerLink}>Open app</Text></Pressable><Text style={s.footerLinkMuted}>Privacy · Terms · Support coming soon</Text></View></View><Text style={s.easterEgg}>Whatever you do, work at it with all your heart. · Colossians 3:23 · by Esther</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page:{flex:1,backgroundColor:C.white},flex:{flex:1},full:{width:"100%"},stack:{flexDirection:"column"},
  nav:{borderBottomWidth:1,borderBottomColor:"#EEF0F2",backgroundColor:"rgba(255,255,255,.97)"},navInner:{width:"100%",maxWidth:1180,minHeight:76,marginHorizontal:"auto",paddingHorizontal:24,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},brand:{flexDirection:"row",alignItems:"center",gap:10},brandLogo:{width:37,height:37,resizeMode:"contain"},brandWord:{color:C.ink,fontSize:21,fontWeight:"800",letterSpacing:3},navRight:{flexDirection:"row",alignItems:"center",gap:20},navNote:{color:C.muted,fontSize:13},navLogin:{minHeight:42,paddingHorizontal:19,alignItems:"center",justifyContent:"center",borderRadius:22,backgroundColor:C.ink},navLoginText:{color:C.white,fontSize:14,fontWeight:"700"},
  hero:{width:"100%",maxWidth:1180,minHeight:700,marginHorizontal:"auto",paddingHorizontal:24,paddingVertical:70,flexDirection:"row",alignItems:"center",gap:40},heroCompact:{minHeight:0,paddingTop:48,paddingBottom:64,flexDirection:"column"},heroCopy:{width:"54%",maxWidth:620},heroCopyCompact:{width:"100%",maxWidth:680,alignItems:"center"},eyebrow:{alignSelf:"flex-start",paddingVertical:8,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:8,borderRadius:20,backgroundColor:C.paleGreen},eyebrowDot:{width:7,height:7,borderRadius:4,backgroundColor:C.green},eyebrowText:{color:C.green,fontSize:11,fontWeight:"800",letterSpacing:1.2},heroTitle:{marginTop:24,color:C.ink,fontSize:67,lineHeight:70,fontWeight:"700",letterSpacing:-3.2},heroTitleCompact:{maxWidth:650,textAlign:"center",fontSize:46,lineHeight:50,letterSpacing:-2},heroBody:{maxWidth:570,marginTop:25,color:C.muted,fontSize:19,lineHeight:30},heroActions:{marginTop:31,flexDirection:"row",alignItems:"center",gap:20},heroActionsNarrow:{width:"100%",flexDirection:"column",alignItems:"stretch"},primaryButton:{minHeight:56,paddingHorizontal:24,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:12,borderRadius:28,backgroundColor:C.navy},primaryButtonText:{color:C.white,fontSize:16,fontWeight:"700"},primaryButtonLight:{backgroundColor:C.white},primaryButtonTextDark:{color:C.navy},comingSoon:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},comingSoonText:{color:C.muted,fontSize:13,fontWeight:"600"},heroChecks:{marginTop:27,flexDirection:"row",flexWrap:"wrap",gap:18},heroCheck:{flexDirection:"row",alignItems:"center",gap:6},heroCheckText:{color:C.ink,fontSize:13,fontWeight:"600"},heroVisual:{width:"42%",minHeight:570,alignItems:"center",justifyContent:"center"},heroVisualCompact:{width:"100%",minHeight:590,marginTop:14},heroCircleOne:{position:"absolute",width:470,height:470,borderRadius:235,backgroundColor:C.paleBlue},heroCircleTwo:{position:"absolute",right:10,bottom:35,width:180,height:180,borderRadius:90,backgroundColor:C.paleGreen},
  phoneShadow:{padding:10,borderRadius:47,backgroundColor:"rgba(16,19,24,.08)",shadowColor:"#142C47",shadowOpacity:.2,shadowRadius:35,shadowOffset:{width:0,height:20},elevation:10},phone:{width:286,height:565,paddingHorizontal:18,paddingTop:14,borderWidth:7,borderColor:C.ink,borderRadius:39,backgroundColor:C.white,overflow:"hidden"},phoneTop:{height:23,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},phoneTime:{color:C.ink,fontSize:11,fontWeight:"700"},phoneSignals:{flexDirection:"row",alignItems:"center",gap:4},phoneBrand:{marginTop:16,flexDirection:"row",alignItems:"center",gap:9},phoneLogo:{width:34,height:34,borderRadius:11},phoneShop:{color:C.ink,fontSize:13,fontWeight:"700"},phoneLocation:{marginTop:2,color:C.muted,fontSize:9},phoneGreeting:{marginTop:25,color:C.ink,fontSize:28,lineHeight:32,fontWeight:"700",letterSpacing:-1.1},phoneDate:{marginTop:4,color:C.muted,fontSize:11},phoneCards:{marginTop:22,flexDirection:"row",flexWrap:"wrap",gap:8},phoneAction:{width:"48%",height:130,padding:12,borderRadius:17},phoneActionIcon:{width:38,height:38,alignItems:"center",justifyContent:"center",borderRadius:12},phoneActionTitle:{marginTop:13,color:C.ink,fontSize:14,fontWeight:"700"},phoneActionHelp:{marginTop:3,color:C.muted,fontSize:10},phoneNav:{position:"absolute",left:15,right:15,bottom:11,height:46,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderTopWidth:1,borderTopColor:C.border,backgroundColor:C.white},
  trustStrip:{backgroundColor:C.ink},trustInner:{width:"100%",maxWidth:1180,minHeight:104,marginHorizontal:"auto",paddingHorizontal:24,paddingVertical:25,alignItems:"center",justifyContent:"center"},trustLead:{color:C.white,fontSize:15,fontWeight:"700"},trustItems:{marginTop:12,flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"center",gap:12},trustItem:{color:"#CBD1D6",fontSize:11,fontWeight:"800",letterSpacing:1.5},trustDivider:{color:"#6D747B"},
  section:{width:"100%",maxWidth:1180,marginHorizontal:"auto",paddingHorizontal:24,paddingVertical:105,alignItems:"center"},sectionKicker:{color:C.green,fontSize:11,fontWeight:"800",letterSpacing:1.5},sectionTitle:{maxWidth:800,marginTop:15,color:C.ink,textAlign:"center",fontSize:49,lineHeight:55,fontWeight:"700",letterSpacing:-2},sectionTitleCompact:{fontSize:37,lineHeight:42,letterSpacing:-1.4},sectionIntro:{maxWidth:660,marginTop:18,color:C.muted,textAlign:"center",fontSize:17,lineHeight:27},benefitGrid:{width:"100%",marginTop:55,flexDirection:"row",gap:17},benefitCard:{width:"32.4%",minHeight:280,padding:28,borderWidth:1,borderColor:C.border,borderRadius:24,backgroundColor:C.white},benefitIcon:{width:52,height:52,alignItems:"center",justifyContent:"center",borderRadius:16},benefitTitle:{marginTop:25,color:C.ink,fontSize:22,lineHeight:27,fontWeight:"700",letterSpacing:-.5},benefitBody:{marginTop:11,color:C.muted,fontSize:15,lineHeight:23},
  storySection:{paddingVertical:100,backgroundColor:C.soft},storyInner:{width:"100%",maxWidth:1180,marginHorizontal:"auto",paddingHorizontal:24,flexDirection:"row",alignItems:"center",gap:60},storyCopy:{width:"43%"},storyTitle:{marginTop:14,color:C.ink,fontSize:47,lineHeight:52,fontWeight:"700",letterSpacing:-1.8},storyBody:{marginTop:20,color:C.muted,fontSize:17,lineHeight:27},storyPoint:{marginTop:27,flexDirection:"row",alignItems:"flex-start",gap:14},storyPointTitle:{color:C.ink,fontSize:16,fontWeight:"700"},storyPointBody:{marginTop:4,color:C.muted,fontSize:14,lineHeight:21},storyVisual:{width:"52%"},previewPanel:{padding:22,borderWidth:1,borderColor:C.border,borderRadius:25,backgroundColor:C.white,shadowColor:C.navy,shadowOpacity:.1,shadowRadius:28,shadowOffset:{width:0,height:14}},previewTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},previewKicker:{color:C.muted,fontSize:9,fontWeight:"800",letterSpacing:1.4},previewTitle:{marginTop:4,color:C.ink,fontSize:23,fontWeight:"700"},todayPill:{paddingVertical:7,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:6,borderRadius:15,backgroundColor:C.paleGreen},todayDot:{width:7,height:7,borderRadius:4,backgroundColor:C.green},todayPillText:{color:C.green,fontSize:9,fontWeight:"700"},previewCategories:{marginTop:21,flexDirection:"row",gap:8},previewCategory:{flex:1,minHeight:80,padding:11,justifyContent:"space-between",borderRadius:13},previewCategoryText:{color:C.ink,fontSize:11,fontWeight:"700"},previewProducts:{marginTop:14,flexDirection:"row",gap:10},previewProduct:{flex:1,borderWidth:1,borderColor:C.border,borderRadius:15,overflow:"hidden",backgroundColor:C.white},previewImage:{width:"100%",height:145,resizeMode:"contain",backgroundColor:"#FAFAFA"},previewProductBody:{padding:11},previewProductName:{color:C.ink,fontSize:12,fontWeight:"700"},previewProductBottom:{marginTop:8,flexDirection:"row",justifyContent:"space-between"},previewPrice:{color:C.ink,fontSize:15,fontWeight:"800"},previewStock:{color:C.muted,fontSize:10},
  featureGrid:{width:"100%",marginTop:50,flexDirection:"row",flexWrap:"wrap",gap:14},featureGridCompact:{flexDirection:"column"},featureCard:{width:"32.4%",minHeight:155,padding:22,flexDirection:"row",alignItems:"flex-start",gap:14,borderRadius:20,backgroundColor:C.soft},featureCardCompact:{width:"100%"},featureIcon:{width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:C.white},featureTitle:{color:C.ink,fontSize:16,fontWeight:"700"},featureBody:{marginTop:7,color:C.muted,fontSize:13,lineHeight:20},
  eventSection:{paddingVertical:105,paddingHorizontal:24,backgroundColor:C.paleGreen},eventInner:{width:"100%",maxWidth:1050,marginHorizontal:"auto",flexDirection:"row",alignItems:"center",gap:55},eventBadge:{width:"42%",minHeight:370,padding:37,justifyContent:"flex-end",borderRadius:30,backgroundColor:C.green},eventBadgeCompact:{width:"100%",minHeight:300},eventBadgeSmall:{marginTop:80,color:"#C9D8D0",fontSize:11,fontWeight:"800",letterSpacing:1.5},eventBadgeBig:{marginTop:13,color:C.white,fontSize:39,lineHeight:43,fontWeight:"700",letterSpacing:-1.3},eventCopy:{width:"53%"},eventTitle:{color:C.ink,fontSize:38,lineHeight:44,fontWeight:"700",letterSpacing:-1.2},eventBody:{marginTop:18,color:C.muted,fontSize:16,lineHeight:25},eventSteps:{marginTop:28,gap:11},eventStep:{minHeight:48,flexDirection:"row",alignItems:"center",gap:12},eventStepNumber:{width:34,height:34,paddingTop:7,borderRadius:17,backgroundColor:C.white,color:C.green,textAlign:"center",fontSize:14,fontWeight:"800"},eventStepText:{color:C.ink,fontSize:15,fontWeight:"700"},
  closing:{paddingVertical:115,paddingHorizontal:24,alignItems:"center",backgroundColor:C.navy},closingLogo:{width:68,height:68,borderRadius:20},closingTitle:{maxWidth:760,marginTop:28,color:C.white,textAlign:"center",fontSize:55,lineHeight:61,fontWeight:"700",letterSpacing:-2},closingBody:{maxWidth:600,marginTop:15,marginBottom:30,color:"#CAD3DC",textAlign:"center",fontSize:18,lineHeight:27},closingNote:{marginTop:16,color:"#AEBAC6",fontSize:12},
  footer:{paddingHorizontal:24,paddingVertical:50,backgroundColor:C.white},footerInner:{width:"100%",maxWidth:1180,marginHorizontal:"auto",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:25},footerLogo:{width:32,height:32},footerBrand:{color:C.ink,fontSize:18,fontWeight:"800",letterSpacing:2.5},footerTag:{marginTop:9,color:C.muted,fontSize:13},footerLinks:{alignItems:"flex-end",gap:9},footerLink:{color:C.ink,fontSize:13,fontWeight:"700"},footerLinkMuted:{color:C.muted,fontSize:11},easterEgg:{marginTop:38,color:"#D3D6D9",textAlign:"center",fontSize:8},
});
